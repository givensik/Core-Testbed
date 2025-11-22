import express from "express";
import fs from "fs/promises";
import path from "path";

function plmnFromImsi(imsi = "") {
  const digits = imsi.replace(/\D/g, "");
  const mcc = digits.slice(0, 3) || "001";
  const mnc = digits.slice(3, 5) || "01";
  return { mcc, mnc };
}

function normalizeHex(value = "") {
  return value ? value.replace(/\s+/g, "").toUpperCase() : "";
}

const templateCache = new Map();

async function loadTemplate(mountDir) {
  const templatePath = path.join(mountDir, "ue-template.yaml");
  if (templateCache.has(templatePath)) {
    return templateCache.get(templatePath);
  }
  const raw = await fs.readFile(templatePath, "utf8");
  templateCache.set(templatePath, raw);
  return raw;
}

function renderTemplate(template, replacements) {
  let rendered = template;
  for (const [key, value] of Object.entries(replacements)) {
    const pattern = new RegExp(`{{${key}}}`, "g");
    rendered = rendered.replace(pattern, value);
  }
  return rendered;
}

async function buildUeConfig(doc, gnbName, mountDir) {
  const template = await loadTemplate(mountDir);
  const { mcc, mnc } = plmnFromImsi(doc.imsi);
  const supi = doc.imsi.startsWith("imsi-") ? doc.imsi : `imsi-${doc.imsi}`;
  const key = normalizeHex(doc.security?.k);
  const opc = normalizeHex(doc.security?.opc || doc.security?.op);
  const opType = doc.security?.opType || "OPC";
  const amf = doc.security?.amf || "8000";
  const homeNetworkPublicKey = doc.security?.homeNetworkPublicKey || "";
  const homeNetworkPublicKeyId = String(
    doc.security?.homeNetworkPublicKeyId ?? 1
  );
  const routingIndicator = doc.routingIndicator || "0000";
  const imei = doc.imei || "356938035643803";
  const imeiSv = doc.imeiSv || "4370816125816151";
  const apn = doc.slice?.[0]?.session?.[0]?.name || "internet";
  const sliceSst = String(doc.slice?.[0]?.sst || 1);
  const sliceSd = String(doc.slice?.[0]?.sd || 1);

  return renderTemplate(template, {
    SUPI: supi,
    MCC: mcc,
    MNC: mnc,
    HOME_NETWORK_PUBLIC_KEY: homeNetworkPublicKey,
    HOME_NETWORK_PUBLIC_KEY_ID: homeNetworkPublicKeyId,
    ROUTING_INDICATOR: routingIndicator,
    KEY: key,
    OP: opc,
    OP_TYPE: opType,
    IMEI: imei,
    IMEISV: imeiSv,
    GNB_NAME: gnbName,
    APN: apn,
    SLICE_SST: sliceSst,
    SLICE_SD: sliceSd,
  });
}

async function writeUeConfig(doc, gnbName, mountDir) {
  // 컨테이너에서 읽을 수 있는 경로(`mountDir`) 아래에 자동 생성된 YAML을 저장
  const fileName = `${doc.imsi}.yaml`;
  const containerPath = path.join(mountDir, "generated", fileName);
  await fs.mkdir(path.dirname(containerPath), { recursive: true });
  const rendered = await buildUeConfig(doc, gnbName, mountDir);
  await fs.writeFile(containerPath, rendered, "utf8");
  return { fileName, containerPath };
}

async function listManagedContainers(docker) {
  // ran-ui 레이블로 태깅된 컨테이너만 조회해 IMSI↔컨테이너 상태를 빠르게 확인
  const summaries = await docker.listContainers({
    all: true,
    filters: { label: ["ran-ui=ue"] },
  });
  const map = new Map();
  for (const summary of summaries) {
    const imsi = summary.Labels?.["ran-ui.imsi"];
    if (imsi) {
      map.set(imsi, summary);
    }
  }
  return map;
}

export default function createUeRouter(
  subscriberCollection,
  { docker, config, network, image }
) {
  if (!docker) {
    throw new Error("docker client missing");
  }

  const router = express.Router();

  router.get("/", async (_req, res, next) => {
    try {
      const docs = await subscriberCollection.find().toArray();
      const containerMap = await listManagedContainers(docker);
      const items = docs.map((doc) => {
        const container = containerMap.get(doc.imsi);
        return {
          id: doc.imsi,
          supi: doc.imsi,
          hasContainer: Boolean(container),
          containerStatus: container?.State || "missing",
          containerId: container?.Id?.slice(0, 12) || null,
          slice: doc.slice,
          gnbName: doc.gnbName || "RAN-GNB",
        };
      });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const { imsi, key, opc, gnbName } = req.body || {};
      if (!imsi || !key || !opc || !gnbName) {
        return res
          .status(400)
          .json({ error: "imsi, key, opc, gnbName are required" });
      }

      const payload = {
        imsi,
        security: {
          k: key,
          opc,
        },
        gnbName,
        status: "pending",
        createdAt: new Date(),
      };

      await subscriberCollection.insertOne(payload);
      return res
        .status(201)
        .json({ message: "UE stored in MongoDB", id: imsi });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/spawn", async (req, res, next) => {
    try {
      const imsi = req.params.id;
      const doc = await subscriberCollection.findOne({ imsi });
      if (!doc) {
        return res.status(404).json({ error: "UE not found in database" });
      }
      console.log(`Spawning UE container for IMSI ${imsi}...`);

      const containerName = `ran-ue-${imsi}`;
      try {
        const existing = docker.getContainer(containerName);
        await existing.inspect();
        return res
          .status(409)
          .json({ error: "UE container already exists", containerName });
      } catch (err) {
        if (err.statusCode && err.statusCode !== 404) {
          throw err;
        }
      }
      console.log(`No existing container found for IMSI ${imsi}, proceeding to spawn.`);
      
      // 검증: 보안 자격 증명 및 구성 디렉토리 존재 여부 확인
      if (!doc.security?.k || !(doc.security?.opc || doc.security?.op)) {
        return res
          .status(400)
          .json({ error: "UE security credentials missing in MongoDB" });
      }
      // 검증: 호스트 및 마운트 디렉토리 설정 확인
      if (!config?.hostDir || !config?.mountDir) {
        return res
          .status(500)
          .json({ error: "Configuration directories not defined" });
      }
      console.log(`Configuration directories verified for IMSI ${imsi}.`);
      console.log(`Writing UE configuration for IMSI ${imsi}...`);
      const { fileName, containerPath } = await writeUeConfig(
        doc,
        doc.gnbName || "RAN-GNB",
        config.mountDir
      );
      const hostPath = path.join(config.hostDir, "generated", fileName);

      const binds = [`${hostPath}:/config/${fileName}:ro`];
      const createOptions = {
        name: containerName,
        Image: image,
        Cmd: ["nr-ue", "-c", `/config/${fileName}`],
        Labels: {
          "ran-ui": "ue",
          "ran-ui.imsi": imsi,
        },
        HostConfig: {
          Binds: binds,
          Privileged: true,
        },
        NetworkingConfig: {
          EndpointsConfig: {
            [network]: {},
          },
        },
      };

      const container = await docker.createContainer(createOptions);
      await container.start();

      await subscriberCollection.updateOne(
        { imsi },
        {
          $set: {
            status: "running",
            containerId: container.id,
            configPath: containerPath,
          },
        }
      );

      res.status(201).json({
        message: "UE container started",
        containerId: container.id,
        containerName,
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const result = await subscriberCollection.deleteOne({ imsi: req.params.id });
      if (!result.deletedCount) {
        return res.status(404).json({ error: "UE not found" });
      }
      return res.json({ message: "UE removed", id: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
} 
