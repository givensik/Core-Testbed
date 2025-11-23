# Core-Testbed

**Project Overview**
- **설명**: Core-Testbed는 경량화된 5G 코어 및 RAN(UE/gNB) 테스트 환경을 빠르게 띄워서 통신 플로우, 설정 테스트, 그리고 연동 실험을 수행할 수 있게 만든 레포지토리입니다. 이 저장소는 Docker 기반의 코어 컴포넌트 모음(`core-node`), RAN 에뮬레이터(`ran-node` / UERANSIM 연동), 연합학습 실험(`FL`) 및 관련 유틸리티 스크립트를 포함합니다.

**Repository Structure (Main Directory)**
- **`core-node`**: AMF, AUSF, NRF, UDM, UDR, UPF 등 코어 네트워크 컴포넌트용 `docker-compose`와 설정 파일들.
- **`ran-node`**: gNB/UE 에뮬레이션 관련 구성, UERANSIM 연동 및 UI(간단한 ran-ui)가 포함된 디렉터리.
- **`FL`**: Federated Learning(연합학습) 실험용 서버/클라이언트 코드와 `requirements.txt`.
- **`common`**: 공통 템플릿과 스크립트(`scripts/spawn_gnb.py`, `scripts/spawn_ue.py`) 및 설정 템플릿.
- **`UERANSIM`**: UERANSIM 관련 자료 및 실행 예제(있다면 내부 README 참조).

**Directory Tree**

```
Core-Testbed/
├─ .gitignore
├─ README.md
├─ common/
│  └─ scripts/
│     ├─ spawn_gnb.py
│     ├─ spawn_ue.py
│     └─ utils.py
├─ core-node/
│  ├─ docker-compose.yml
│  ├─ Dockerfile.amf
│  ├─ Dockerfile.ausf
│  ├─ Dockerfile.nrf
│  ├─ Dockerfile.pcf
│  ├─ Dockerfile.scp
│  ├─ Dockerfile.smf
│  ├─ Dockerfile.udm
│  ├─ Dockerfile.udr
│  ├─ Dockerfile.upf
│  ├─ Dockerfile.webui
│  ├─ run.sh
│  └─ config/
│     ├─ amf.yaml
│     ├─ ausf.yaml
│     ├─ nrf.yaml
│     ├─ pcf.yaml
│     ├─ scp.yaml
│     ├─ smf.yaml
│     ├─ udm.yaml
│     ├─ udr.yaml
│     └─ upf.yaml
├─ FL/
│  ├─ docker-compose.yml
│  ├─ prepare_data.py
│  ├─ README.md
│  ├─ requirements.txt
│  ├─ client/
│  │  └─ fl_client.py
│  ├─ server/
│  │  └─ fl_server.py
│  └─ shared/
│     ├─ model.py
│     └─ utils.py
├─ ran-node/
│  ├─ docker-compose.yml
│  ├─ Dockerfile.ran-ui
│  ├─ Dockerfile.ueransim
│  ├─ run.sh
│  ├─ configs/
│  │  ├─ gnb.yaml
│  │  ├─ ue-template.yaml
│  │  ├─ ue.yaml
│  │  └─ generated/
│  └─ ran-ui/
│     ├─ package.json
│     └─ src/
│        ├─ server.js
│        └─ routes/
│           └─ ue.js
└─ UERANSIM/
```

**Prerequisites**
- **OS**: Linux (WSL2도 가능)
- **도구**: `docker` 및 `docker-compose`, `python3.10` 이상
- **추가(선택)**: `node`/`npm` (Local)
- **Python deps**: FL 실험을 돌리려면 `FL/requirements.txt` 참조

**Quick Start**

- **1) 코어 노드 시작**

	```bash
	cd core-node
	# 간단히 Docker Compose로 시작
	docker-compose up -d
	# 또는 레포지토리에 제공된 run.sh를 이용
	./run.sh
	```

- **2) RAN 노드(UERANSIM) 시작**

	```bash
	cd ran-node
	./run.sh
	# 또는 내부 docker-compose 사용
	docker-compose up -d
	```

- **3) Federated Learning(FL) 실험 실행**

	```bash
	# 의존성 설치
	python3 -m pip install -r FL/requirements.txt

	# 서버 실행
	python3 FL/server/fl_server.py

	# 클라이언트(여러 인스턴스 실행 가능)
	python3 FL/client/fl_client.py
	```

- **4) gNB/UE 자동 생성 스크립트 사용**

	```bash
	# 예: gNB 여러개 생성
	python3 common/scripts/spawn_gnb.py --count 2 --template common/configs/gnb-template.yaml

	# 예: UE 생성
	python3 common/scripts/spawn_ue.py --count 5 --template common/configs/ue-template.yaml
	```

**Configuration Files**
- **`core-node/config/*.yaml`**: 각 코어 컴포넌트(AMF/AUSF/NRF/UDM/UDR/UPF)의 설정 파일
- **`ran-node/configs/`**: gNB/UE 템플릿과 실제 생성된 UE 구성(`generated/`)이 위치
- **`common/configs/`**: 재사용 가능한 템플릿(`gnb-template.yaml`, `ue-template.yaml`)

설정을 변경한 뒤에는 관련 서비스를 재시작해야 합니다(`docker-compose restart <service>` 또는 `docker-compose down && up -d`).
