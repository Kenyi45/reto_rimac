const swaggerHTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rimac Appointment API - Documentación</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
    <style>
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; background: #fafafa; }
        .swagger-ui .topbar { background-color: #1f4e79; }
        .swagger-ui .topbar .download-url-wrapper { display: none; }
        .custom-header {
            background: linear-gradient(135deg, #1f4e79 0%, #2980b9 100%);
            color: white;
            padding: 20px;
            text-align: center;
            margin-bottom: 20px;
        }
        .custom-header h1 { margin: 0; font-size: 2.5em; font-weight: 300; }
        .custom-header p { margin: 10px 0 0 0; font-size: 1.2em; opacity: 0.9; }
    </style>
</head>
<body>
    <div class="custom-header">
        <h1>🏥 Rimac Appointment API</h1>
        <p>Sistema de Agendamiento de Citas Médicas</p>
    </div>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            const spec = {
                "openapi": "3.0.0",
                "info": {
                    "title": "Rimac Appointment API",
                    "description": "Sistema de agendamiento de citas médicas para asegurados de Rimac",
                    "version": "1.0.0"
                },
                "servers": [{"url": "https://ppsr3rlfn0.execute-api.us-east-1.amazonaws.com/dev"}],
                "paths": {
                    "/appointment": {
                        "post": {
                            "summary": "Crear nueva cita médica",
                            "tags": ["Citas"],
                            "requestBody": {
                                "required": true,
                                "content": {
                                    "application/json": {
                                        "schema": {"$ref": "#/components/schemas/AppointmentRequest"},
                                        "examples": {
                                            "peru": {"value": {"insuredId": "00123", "scheduleId": 100, "countryISO": "PE"}},
                                            "chile": {"value": {"insuredId": "00456", "scheduleId": 200, "countryISO": "CL"}}
                                        }
                                    }
                                }
                            },
                            "responses": {
                                "200": {"description": "Cita creada exitosamente"},
                                "400": {"description": "Datos inválidos"},
                                "500": {"description": "Error interno"}
                            }
                        }
                    },
                    "/appointment/{insuredId}": {
                        "get": {
                            "summary": "Obtener citas de un asegurado",
                            "tags": ["Citas"],
                            "parameters": [{
                                "name": "insuredId",
                                "in": "path",
                                "required": true,
                                "schema": {"type": "string", "pattern": "^\\\\d{5}$"}
                            }],
                            "responses": {
                                "200": {"description": "Lista de citas"}
                            }
                        }
                    }
                },
                "components": {
                    "schemas": {
                        "AppointmentRequest": {
                            "type": "object",
                            "required": ["insuredId", "scheduleId", "countryISO"],
                            "properties": {
                                "insuredId": {"type": "string", "pattern": "^\\\\d{5}$"},
                                "scheduleId": {"type": "integer", "minimum": 1},
                                "countryISO": {"type": "string", "enum": ["PE", "CL"]}
                            }
                        }
                    }
                }
            };

            SwaggerUIBundle({
                spec: spec,
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
                layout: "StandaloneLayout",
                tryItOutEnabled: true
            });
        };
    </script>
</body>
</html>`;

exports.handler = async (event) => {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, OPTIONS'
        },
        body: swaggerHTML
    };
}; 