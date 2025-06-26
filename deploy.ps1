# Script de deploy para el proyecto Rimac Appointment Backend
Write-Host "=== RIMAC APPOINTMENT BACKEND DEPLOY ===" -ForegroundColor Green

# Verificar que AWS CLI esté configurado
Write-Host "1. Verificando AWS CLI..." -ForegroundColor Yellow
try {
    $accountId = aws sts get-caller-identity --query Account --output text
    Write-Host "   ✓ AWS Account ID: $accountId" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Error: AWS CLI no configurado. Ejecuta 'aws configure'" -ForegroundColor Red
    exit 1
}

# Verificar que Serverless esté instalado
Write-Host "2. Verificando Serverless Framework..." -ForegroundColor Yellow
try {
    $slsVersion = serverless --version
    Write-Host "   ✓ Serverless instalado" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Error: Serverless no instalado. Ejecuta 'npm install -g serverless'" -ForegroundColor Red
    exit 1
}

# Compilar TypeScript
Write-Host "3. Compilando TypeScript..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ✗ Error en compilación TypeScript" -ForegroundColor Red
    exit 1
}
Write-Host "   ✓ Compilación exitosa" -ForegroundColor Green

# Deploy con Serverless
Write-Host "4. Desplegando infraestructura..." -ForegroundColor Yellow
serverless deploy --stage dev --verbose
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ✗ Error en deploy" -ForegroundColor Red
    exit 1
}

Write-Host "=== DEPLOY COMPLETADO EXITOSAMENTE ===" -ForegroundColor Green
Write-Host "🚀 Sistema funcionando correctamente!" -ForegroundColor Cyan
Write-Host "📋 Recursos desplegados:" -ForegroundColor White
Write-Host "   • Lambda Functions: appointment, appointmentPE, appointmentCL" -ForegroundColor Gray
Write-Host "   • API Gateway con CORS habilitado" -ForegroundColor Gray
Write-Host "   • DynamoDB para almacenamiento principal" -ForegroundColor Gray
Write-Host "   • SNS Topics para notificaciones PE/CL" -ForegroundColor Gray
Write-Host "   • SQS Queues para procesamiento asíncrono" -ForegroundColor Gray
Write-Host "   • EventBridge para eventos de sistema" -ForegroundColor Gray 