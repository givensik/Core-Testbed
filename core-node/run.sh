#!/bin/bash

# 색상 정의 (보기 좋게 하기 위함)
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== [1/4] 기존 컨테이너 정리 중... ===${NC}"
docker compose down

echo -e "${GREEN}=== [2/4] 인프라 (DB, NRF, SCP) 실행 중... ===${NC}"
# 가장 중요한 전화번호부(NRF)와 중계기(SCP)를 먼저 켭니다.
docker compose up -d mongo nrf scp --build

echo "   >>> NRF와 SCP가 준비될 때까지 5초 대기..."
sleep 5

echo -e "${GREEN}=== [3/4] 정책 및 데이터 서버 (PCF, UDR, UDM, AUSF) 실행 중... ===${NC}"
# PCF가 켜져서 SCP에 등록할 시간을 벌어줍니다. (여기가 핵심!)
docker compose up -d udr udm ausf pcf --build

echo "   >>> PCF가 NRF/SCP에 등록될 때까지 8초 대기..."
sleep 8

echo -e "${GREEN}=== [4/4] 컨트롤 및 유저 플레인 (AMF, SMF, UPF, WebUI) 실행 중... ===${NC}"
# 모든 준비가 끝났으므로 AMF를 포함한 나머지를 켭니다.
docker compose up -d amf smf upf webui --build

echo -e "${GREEN}=== Open5GS 실행 완료! ===${NC}"
docker compose ps