import { 
  APIGatewayProxyEvent, 
  APIGatewayProxyResult, 
  SQSEvent, 
  Context 
} from 'aws-lambda';
import { AppointmentService } from '../services/appointment.service';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { NotificationService } from '../services/notification.service';
import { ValidationService } from '../services/validation.service';
import {
  AppointmentResponse,
  AppointmentListResponse,
  AppointmentStatus,
  AppointmentConfirmedEvent,
  AppointmentError
} from '../types/appointment.types';

// Inicialización de servicios (singleton pattern)
let appointmentService: AppointmentService;

/**
 * Inicializa los servicios necesarios
 * Implementa el patrón Singleton para reutilizar conexiones
 */
function initializeServices(): AppointmentService {
  if (!appointmentService) {
    const appointmentRepository = new AppointmentRepository();
    const notificationService = new NotificationService();
    const validationService = new ValidationService();
    
    appointmentService = new AppointmentService(
      appointmentRepository,
      notificationService,
      validationService
    );
  }
  
  return appointmentService;
}

/**
 * Handler principal del Lambda appointment
 * Maneja requests HTTP y mensajes SQS
 * @param event - Evento de Lambda (HTTP o SQS)
 * @param context - Contexto de Lambda
 * @returns Respuesta apropiada según el tipo de evento
 */
export const handler = async (
  event: APIGatewayProxyEvent | SQSEvent,
  context: Context
): Promise<APIGatewayProxyResult | void> => {
  console.log('Appointment handler started', { 
    eventType: event.hasOwnProperty('httpMethod') ? 'HTTP' : 'SQS',
    requestId: context.awsRequestId 
  });

  try {
    // Determinar el tipo de evento
    if (isAPIGatewayEvent(event)) {
      return await handleHttpRequest(event, context);
    } else if (isSQSEvent(event)) {
      return await handleSQSMessages(event, context);
    } else {
      throw new Error('Unsupported event type');
    }
  } catch (error) {
    console.error('Error in appointment handler:', error);
    
    if (isAPIGatewayEvent(event)) {
      return createErrorResponse(error);
    }
    
    // Para eventos SQS, relanzar el error para activar DLQ
    throw error;
  }
};

/**
 * Maneja requests HTTP de API Gateway
 * @param event - Evento de API Gateway
 * @param context - Contexto de Lambda
 * @returns Respuesta HTTP
 */
async function handleHttpRequest(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const service = initializeServices();
  const method = event.httpMethod;
  const path = event.path;

  console.log(`HTTP Request: ${method} ${path}`);

  try {
    // Handle OPTIONS requests for CORS
    if (method === 'OPTIONS') {
      return createResponse(200, {
        message: 'CORS preflight successful'
      });
    }
    
    if (method === 'POST' && path === '/appointment') {
      return await handleCreateAppointment(event, service);
    } else if (method === 'GET' && path.startsWith('/appointment/')) {
      return await handleGetAppointments(event, service);
    } else {
      return createResponse(404, {
        success: false,
        message: 'Endpoint not found',
        error: `${method} ${path} is not supported`
      });
    }
  } catch (error) {
    console.error(`Error handling HTTP request ${method} ${path}:`, error);
    return createErrorResponse(error);
  }
}

/**
 * Maneja la creación de citas médicas (POST /appointment)
 * @param event - Evento de API Gateway
 * @param service - Servicio de citas
 * @returns Respuesta HTTP
 */
async function handleCreateAppointment(
  event: APIGatewayProxyEvent,
  service: AppointmentService
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return createResponse(400, {
      success: false,
      message: 'Request body is required',
      error: 'El cuerpo de la petición es requerido'
    });
  }

  let requestData: unknown;
  try {
    requestData = JSON.parse(event.body);
  } catch (error) {
    return createResponse(400, {
      success: false,
      message: 'Invalid JSON in request body',
      error: 'El formato JSON es inválido'
    });
  }

  const result: AppointmentResponse = await service.createAppointment(requestData);
  const statusCode = result.success ? 201 : 400;

  return createResponse(statusCode, result);
}

/**
 * Maneja la consulta de citas por asegurado (GET /appointment/{insuredId})
 * @param event - Evento de API Gateway
 * @param service - Servicio de citas
 * @returns Respuesta HTTP
 */
async function handleGetAppointments(
  event: APIGatewayProxyEvent,
  service: AppointmentService
): Promise<APIGatewayProxyResult> {
  const insuredId = event.pathParameters?.insuredId;

  if (!insuredId) {
    return createResponse(400, {
      success: false,
      message: 'insuredId parameter is required',
      error: 'El parámetro insuredId es requerido'
    });
  }

  try {
    const result: AppointmentListResponse = await service.getAppointmentsByInsuredId(insuredId);
    return createResponse(200, result);
  } catch (error) {
    console.error('Error getting appointments:', error);
    return createErrorResponse(error);
  }
}

/**
 * Maneja mensajes SQS de confirmación
 * @param event - Evento SQS
 * @param context - Contexto de Lambda
 */
async function handleSQSMessages(event: SQSEvent, context: Context): Promise<void> {
  const service = initializeServices();
  
  console.log(`Processing ${event.Records.length} SQS messages`);

  for (const record of event.Records) {
    try {
      console.log('Processing SQS record:', {
        messageId: record.messageId,
        source: record.eventSource
      });

      // Parsear el mensaje de confirmación
      const messageBody = JSON.parse(record.body);
      let confirmationEvent: AppointmentConfirmedEvent;

      // El mensaje puede venir directamente de EventBridge o encapsulado
      if (messageBody.detail) {
        // Mensaje de EventBridge
        confirmationEvent = messageBody.detail;
      } else {
        // Mensaje directo
        confirmationEvent = messageBody;
      }

      // Actualizar el estado de la cita a completado
      await service.updateAppointmentStatus(
        confirmationEvent.appointmentId,
        AppointmentStatus.COMPLETED
      );

      console.log(`Appointment ${confirmationEvent.appointmentId} marked as completed`);

    } catch (error) {
      console.error('Error processing SQS record:', {
        messageId: record.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
        body: record.body
      });

      // En un entorno real, podrías implementar lógica de retry
      // Por ahora, continuamos con el siguiente mensaje
      throw error; // Esto hará que el mensaje vaya a DLQ
    }
  }
}

// Funciones utilitarias

/**
 * Verifica si el evento es de API Gateway
 * @param event - Evento a verificar
 * @returns true si es evento de API Gateway
 */
function isAPIGatewayEvent(event: any): event is APIGatewayProxyEvent {
  return event.hasOwnProperty('httpMethod') && event.hasOwnProperty('path');
}

/**
 * Verifica si el evento es de SQS
 * @param event - Evento a verificar
 * @returns true si es evento de SQS
 */
function isSQSEvent(event: any): event is SQSEvent {
  return event.hasOwnProperty('Records') && Array.isArray(event.Records) && 
         event.Records.length > 0 && event.Records[0].hasOwnProperty('eventSource') &&
         event.Records[0].eventSource === 'aws:sqs';
}

/**
 * Crea una respuesta HTTP estructurada
 * @param statusCode - Código de estado HTTP
 * @param body - Cuerpo de la respuesta
 * @returns Respuesta de API Gateway
 */
function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify(body)
  };
}

/**
 * Crea una respuesta de error HTTP
 * @param error - Error a procesar
 * @returns Respuesta de error
 */
function createErrorResponse(error: unknown): APIGatewayProxyResult {
  console.error('Creating error response:', error);

  if (error instanceof AppointmentError) {
    return createResponse(error.statusCode, {
      success: false,
      message: 'Error en la solicitud',
      error: error.message,
      code: error.code
    });
  }

  return createResponse(500, {
    success: false,
    message: 'Error interno del servidor',
    error: 'Ha ocurrido un error inesperado. Por favor intente nuevamente.'
  });
}

/**
 * Handler para OPTIONS (CORS preflight)
 * @param event - Evento de API Gateway
 * @returns Respuesta CORS
 */
export const optionsHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '3600'
    },
    body: ''
  };
}; 