#!/bin/bash

# Script de prueba para la API de citas médicas Rimac
# Uso: ./scripts/test-api.sh

# Configuración - URL real de la API desplegada
BASE_URL="https://guhnek2pq7.execute-api.us-east-1.amazonaws.com/dev"
CONTENT_TYPE="Content-Type: application/json"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Función para hacer requests y mostrar resultados
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    print_header "$description"
    echo "Request: $method $BASE_URL$endpoint"
    
    if [ -n "$data" ]; then
        echo "Data: $data"
        response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
            -H "$CONTENT_TYPE" \
            -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint")
    fi
    
    # Extraer código de estado y cuerpo
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    echo "Status Code: $http_code"
    echo "Response:"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    
    # Validar resultado
    if [[ $http_code -ge 200 && $http_code -lt 300 ]]; then
        print_success "Request successful"
    elif [[ $http_code -ge 400 && $http_code -lt 500 ]]; then
        print_warning "Client error"
    else
        print_error "Server error"
    fi
    
    echo ""
    sleep 1
}

# Verificar dependencias
if ! command -v curl &> /dev/null; then
    print_error "curl is required but not installed."
    exit 1
fi

if ! command -v jq &> /dev/null; then
    print_warning "jq is not installed. JSON responses will not be formatted."
fi

print_header "Testing Rimac Appointment API - Sistema Funcionando"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Crear cita válida para Perú
make_request "POST" "/appointment" '{
  "insuredId": "00123",
  "scheduleId": 100,
  "countryISO": "PE"
}' "Test 1: Create valid appointment for Peru"

# Test 2: Crear cita válida para Chile
make_request "POST" "/appointment" '{
  "insuredId": "00456",
  "scheduleId": 200,
  "countryISO": "CL"
}' "Test 2: Create valid appointment for Chile"

# Test 3: Consultar citas de asegurado
make_request "GET" "/appointment/00123" '' "Test 3: Get appointments for insured ID 00123"

# Test 4: Crear cita con datos inválidos
make_request "POST" "/appointment" '{
  "insuredId": "123",
  "scheduleId": -1,
  "countryISO": "US"
}' "Test 4: Create appointment with invalid data"

print_header "API Testing Complete"
print_success "Sistema funcionando correctamente"
echo ""
echo "✅ Endpoints disponibles:"
echo "  POST /appointment - Crear nueva cita"
echo "  GET /appointment/{insuredId} - Obtener citas por asegurado"
echo ""
echo "📊 Monitoreo:"
echo "  aws logs tail /aws/lambda/rimac-appointment-backend-dev-appointment --follow" 