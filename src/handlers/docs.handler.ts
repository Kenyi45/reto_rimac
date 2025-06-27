import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as fs from 'fs';
import * as path from 'path';

const swaggerHTML = `
<!DOCTYPE html>
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
    </style>
</head>
<body>
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
                    "version": "1.0.0",
                    "contact": {
                        "name": "Rimac Backend Team",
                        "email": "backend@rimac.com"
                    },
                    "license": {
                        "name": "MIT"
                    }
                },
                "servers": [
                    {
                        "url": "https://ppsr3rlfn0.execute-api.us-east-1.amazonaws.com/dev",
                        "description": "Servidor de desarrollo"
                    }
                ],
                "paths": {
                    "/appointment": {
                        "post": {
                            "summary": "Crear nueva cita médica",
                            "description": "Crea una nueva cita médica para un asegurado",
                            "tags": ["Citas"],
                            "requestBody": {
                                "required": true,
                                "content": {
                                    "application/json": {
                                        "schema": {
                                            "$ref": "#/components/schemas/AppointmentRequest"
                                        },
                                        "examples": {
                                            "peru_example": {
                                                "summary": "Cita para Perú",
                                                "value": {
                                                    "insuredId": "00123",
                                                    "scheduleId": 100,
                                                    "countryISO": "PE"
                                                }
                                            },
                                            "chile_example": {
                                                "summary": "Cita para Chile",
                                                "value": {
                                                    "insuredId": "00456",
                                                    "scheduleId": 200,
                                                    "countryISO": "CL"
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            "responses": {
                                "200": {
                                    "description": "Cita creada exitosamente",
                                    "content": {
                                        "application/json": {
                                            "schema": {
                                                "$ref": "#/components/schemas/AppointmentResponse"
                                            }
                                        }
                                    }
                                },
                                "400": {
                                    "description": "Datos de solicitud inválidos"
                                },
                                "409": {
                                    "description": "Conflicto - Ya existe una cita para el horario"
                                },
                                "500": {
                                    "description": "Error interno del servidor"
                                }
                            }
                        }
                    },
                    "/appointment/{insuredId}": {
                        "get": {
                            "summary": "Obtener citas de un asegurado",
                            "description": "Recupera todas las citas de un asegurado específico",
                            "tags": ["Citas"],
                            "parameters": [
                                {
                                    "name": "insuredId",
                                    "in": "path",
                                    "required": true,
                                    "description": "ID del asegurado (5 dígitos)",
                                    "schema": {
                                        "type": "string",
                                        "pattern": "^\\\\d{5}$",
                                        "example": "00123"
                                    }
                                }
                            ],
                            "responses": {
                                "200": {
                                    "description": "Lista de citas del asegurado",
                                    "content": {
                                        "application/json": {
                                            "schema": {
                                                "$ref": "#/components/schemas/AppointmentListResponse"
                                            }
                                        }
                                    }
                                },
                                "400": {
                                    "description": "ID de asegurado inválido"
                                },
                                "404": {
                                    "description": "No se encontraron citas"
                                }
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
                                "insuredId": {
                                    "type": "string",
                                    "pattern": "^\\\\d{5}$",
                                    "description": "ID del asegurado (5 dígitos)",
                                    "example": "00123"
                                },
                                "scheduleId": {
                                    "type": "integer",
                                    "minimum": 1,
                                    "description": "ID del horario disponible",
                                    "example": 100
                                },
                                "countryISO": {
                                    "type": "string",
                                    "enum": ["PE", "CL"],
                                    "description": "Código ISO del país",
                                    "example": "PE"
                                }
                            }
                        },
                        "AppointmentResponse": {
                            "type": "object",
                            "properties": {
                                "success": {
                                    "type": "boolean",
                                    "example": true
                                },
                                "message": {
                                    "type": "string",
                                    "example": "El agendamiento está en proceso"
                                },
                                "data": {
                                    "$ref": "#/components/schemas/Appointment"
                                }
                            }
                        },
                        "AppointmentListResponse": {
                            "type": "object",
                            "properties": {
                                "success": {
                                    "type": "boolean",
                                    "example": true
                                },
                                "data": {
                                    "type": "array",
                                    "items": {
                                        "$ref": "#/components/schemas/Appointment"
                                    }
                                },
                                "total": {
                                    "type": "integer",
                                    "example": 1
                                }
                            }
                        },
                        "Appointment": {
                            "type": "object",
                            "properties": {
                                "id": {
                                    "type": "string",
                                    "format": "uuid",
                                    "description": "ID único de la cita",
                                    "example": "550e8400-e29b-41d4-a716-446655440000"
                                },
                                "insuredId": {
                                    "type": "string",
                                    "pattern": "^\\\\d{5}$",
                                    "description": "ID del asegurado",
                                    "example": "00123"
                                },
                                "scheduleId": {
                                    "type": "integer",
                                    "description": "ID del horario",
                                    "example": 100
                                },
                                "countryISO": {
                                    "type": "string",
                                    "enum": ["PE", "CL"],
                                    "description": "Código ISO del país",
                                    "example": "PE"
                                },
                                "status": {
                                    "type": "string",
                                    "enum": ["pending", "processing", "completed", "cancelled", "failed"],
                                    "description": "Estado de la cita",
                                    "example": "pending"
                                },
                                "createdAt": {
                                    "type": "string",
                                    "format": "date-time",
                                    "description": "Fecha de creación",
                                    "example": "2024-03-15T10:30:00.000Z"
                                },
                                "updatedAt": {
                                    "type": "string",
                                    "format": "date-time",
                                    "description": "Fecha de última actualización",
                                    "example": "2024-03-15T10:30:00.000Z"
                                }
                            }
                        }
                    }
                },
                "tags": [
                    {
                        "name": "Citas",
                        "description": "Operaciones relacionadas con el agendamiento de citas médicas"
                    }
                ]
            };

            const ui = SwaggerUIBundle({
                spec: spec,
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                tryItOutEnabled: true,
                supportedSubmitMethods: ['get', 'post']
            });
        };
    </script>
</body>
</html>
`;

export const handler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    try {
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
    } catch (error) {
        console.error('Error serving documentation:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                message: 'Error al cargar la documentación',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
}; 