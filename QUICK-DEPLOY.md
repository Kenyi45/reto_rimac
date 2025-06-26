# 🚀 Despliegue Rápido - Documentación Swagger

## ⚡ PASOS RÁPIDOS

### 1. Desplegar los cambios
```bash
# Abrir PowerShell o CMD en el directorio del proyecto
cd C:\Users\kenyi\Desktop\reto_aws

# Ejecutar despliegue
npx serverless deploy
```

### 2. Acceder a la documentación
Una vez desplegado, tu documentación estará disponible en:

**🎯 ENDPOINT DE DOCUMENTACIÓN:**
```
https://guhnek2pq7.execute-api.us-east-1.amazonaws.com/dev/docs
```

## 📋 LO QUE SE AGREGÓ

✅ **Nuevo endpoint `/docs`** - Documentación Swagger interactiva  
✅ **Handler `documentation.js`** - Sirve la interfaz Swagger UI  
✅ **Configuración en `serverless.yml`** - Endpoint habilitado  
✅ **README actualizado** - Instrucciones de acceso  

## 🔍 VERIFICAR FUNCIONAMIENTO

Después del deploy, prueba estos endpoints:

### 1. Documentación
```bash
curl https://guhnek2pq7.execute-api.us-east-1.amazonaws.com/dev/docs
```

### 2. API funcionando
```bash
curl -X POST "https://guhnek2pq7.execute-api.us-east-1.amazonaws.com/dev/appointment" \
  -H "Content-Type: application/json" \
  -d '{"insuredId":"00123","scheduleId":100,"countryISO":"PE"}'
```

## 🎉 RESULTADO ESPERADO

Una vez desplegado tendrás:

1. **Documentación interactiva** en `/docs`
2. **Interfaz Swagger UI** moderna y funcional
3. **Botones "Try it out"** para probar la API directamente
4. **Ejemplos de requests** para PE y CL
5. **Documentación siempre actualizada** con tu API

---

**¡Tu API ahora tendrá su propia documentación integrada!** 🎯 