# 🏥 Rimac Appointment Backend

Sistema de agendamiento de citas médicas para asegurados de Rimac en Perú y Chile.

## 📋 Estado del Proyecto

✅ **Sistema funcionando correctamente**
- API Gateway desplegado y operativo
- Lambda functions procesando correctamente
- Base de datos RDS conectada
- Notificaciones SNS configuradas
- Colas SQS procesando eventos

## 🌐 API Endpoints

**URL Base:** `https://guhnek2pq7.execute-api.us-east-1.amazonaws.com/dev`

### Endpoints Disponibles:
- `POST /appointment` - Crear nueva cita médica
- `GET /appointment/{insuredId}` - Obtener citas de un asegurado
- `GET /docs` - **Documentación Swagger interactiva** 📖

## 📖 Documentación API (Swagger)

### **🎯 OPCIÓN 1: Endpoint Directo (Nuevo!)**
**URL**: `https://guhnek2pq7.execute-api.us-east-1.amazonaws.com/dev/docs`
- Documentación Swagger interactiva integrada en tu API
- Interfaz moderna con ejemplos y botones "Try it out"
- ¡Disponible después del próximo deploy!

### **🌍 Opción 2: Swagger Editor Online**
1. Ve a [Swagger Editor](https://editor.swagger.io/)
2. Copia y pega el contenido del archivo `swagger.yaml`
3. Verás la documentación interactiva completa

### **☁️ Opción 3: AWS API Gateway Console**
1. Ve a AWS Console → API Gateway
2. Busca: `rimac-appointment-backend-dev`
3. Sección "Documentation" para ver la documentación auto-generada

## 🚀 Despliegue

```bash
# Instalar dependencias
npm install

# Instalar plugin de documentación
npm install --save-dev serverless-aws-documentation

# Desplegar
./deploy.ps1
```

## 🧪 Pruebas

### Tests Unitarios
```bash
# Ejecutar todos los tests
npm test

# Ejecutar tests en modo watch
npm run test:watch

# Generar reporte de cobertura
npm run test:coverage
```

### Pruebas de API
```bash
# Ejecutar script de pruebas de API
./scripts/test-api.sh

# Probar crear cita
curl -X POST "https://guhnek2pq7.execute-api.us-east-1.amazonaws.com/dev/appointment" \
  -H "Content-Type: application/json" \
  -d '{"insuredId":"00123","scheduleId":100,"countryISO":"PE"}'

# Probar obtener citas
curl -X GET "https://guhnek2pq7.execute-api.us-east-1.amazonaws.com/dev/appointment/00123"

# Ver documentación
curl https://guhnek2pq7.execute-api.us-east-1.amazonaws.com/dev/docs
```

## 🏗️ Arquitecrura

- **API Gateway**: Punto de entrada REST
- **Lambda Functions**: 
  - `appointment`: Handler principal
  - `appointmentPE`: Procesador Perú
  - `appointmentCL`: Procesador Chile
- **DynamoDB**: Almacenamiento principal
- **RDS MySQL**: Datos específicos por país
- **SNS/SQS**: Notificaciones y colas asíncronas
- **EventBridge**: Eventos del sistema

## 📁 Estructura del Proyecto

```
reto_aws/
├── swagger.yaml              # Documentación OpenAPI
├── documentation.js          # Handler de documentación
├── jest.config.js           # Configuración de Jest
├── serverless.yml           # Configuración Serverless
├── src/
│   ├── handlers/           # Lambda handlers
│   ├── services/          # Lógica de negocio
│   ├── repositories/      # Acceso a datos
│   ├── schemas/          # JSON schemas
│   ├── types/           # Tipos TypeScript
│   └── __tests__/       # Tests unitarios
└── scripts/
    └── test-api.sh       # Scripts de prueba API
```

## 🔍 Monitoreo

- **CloudWatch Logs**: Logs de las funciones Lambda
- **CloudWatch Metrics**: Métricas de rendimiento
- **SNS**: Notificaciones de errores

## 🌍 Países Soportados

- **Perú (PE)**: RDS `rimac-appointments-pe`
- **Chile (CL)**: RDS `rimac-appointments-cl`

---

**Equipo de Desarrollo:** Rimac Backend Team 