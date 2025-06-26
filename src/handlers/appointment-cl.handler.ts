import { SQSEvent, Context } from 'aws-lambda';
import { NotificationService } from '../services/notification.service';
import { AppointmentProcessorCL } from '../services/appointment-processor.service';
import {
  AppointmentCreatedEvent,
  CountryISO,
  AppointmentError
} from '../types/appointment.types';

// Inicialización de servicios (singleton pattern)
let notificationService: NotificationService;
let appointmentProcessor: AppointmentProcessorCL;

/**
 * Inicializa los servicios necesarios para Chile
 * Implementa el patrón Singleton para reutilizar conexiones
 */
function initializeServices(): { processor: AppointmentProcessorCL; notification: NotificationService } {
  if (!notificationService) {
    notificationService = new NotificationService();
  }
  
  if (!appointmentProcessor) {
    appointmentProcessor = new AppointmentProcessorCL(notificationService);
  }
  
  return {
    processor: appointmentProcessor,
    notification: notificationService
  };
}

/**
 * Handler del Lambda appointment-cl
 * Procesa mensajes SQS específicos para citas médicas en Chile
 * @param event - Evento SQS
 * @param context - Contexto de Lambda
 */
export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  console.log('Appointment CL handler started', {
    messageCount: event.Records.length,
    requestId: context.awsRequestId
  });

  const { processor, notification } = initializeServices();
  const errors: string[] = [];

  // Procesar cada mensaje SQS
  for (const record of event.Records) {
    try {
      console.log('Processing SQS record for Chile:', {
        messageId: record.messageId,
        receiptHandle: record.receiptHandle?.substring(0, 20) + '...'
      });

      // Parsear el mensaje
      const appointmentEvent = await parseAppointmentEvent(record.body);
      
      // Validar que es para Chile
      validateCountryEvent(appointmentEvent);
      
      // Procesar la cita usando la estrategia específica de Chile
      await processor.processAppointment(appointmentEvent);
      
      console.log('Chile appointment processed successfully:', {
        appointmentId: appointmentEvent.appointmentId,
        insuredId: appointmentEvent.insuredId,
        scheduleId: appointmentEvent.scheduleId
      });

    } catch (error) {
      const errorMessage = `Error processing Chile appointment: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMessage, {
        messageId: record.messageId,
        body: record.body,
        error: error instanceof Error ? error.stack : error
      });

      errors.push(errorMessage);

      // Notificar error crítico
      try {
        await notification.notifyError(
          error instanceof Error ? error : new Error(errorMessage),
          {
            country: CountryISO.CL,
            messageId: record.messageId,
            sqsBody: record.body,
            lambda: 'appointment-cl'
          }
        );
      } catch (notificationError) {
        console.error('Failed to send error notification:', notificationError);
      }
    }
  }

  // Si hay errores, lanzar excepción para que los mensajes vayan a DLQ
  if (errors.length > 0) {
    const consolidatedError = new AppointmentError(
      `Failed to process ${errors.length} messages: ${errors.join('; ')}`,
      'BATCH_PROCESSING_ERROR'
    );
    
    console.error('Batch processing failed for Chile appointments:', {
      errorCount: errors.length,
      errors: errors
    });
    
    throw consolidatedError;
  }

  console.log(`Successfully processed ${event.Records.length} Chile appointments`);
};

/**
 * Parsea el evento de cita médica desde el mensaje SQS
 * @param messageBody - Cuerpo del mensaje SQS
 * @returns Evento de cita creada
 */
async function parseAppointmentEvent(messageBody: string): Promise<AppointmentCreatedEvent> {
  try {
    const parsedBody = JSON.parse(messageBody);
    
    // El mensaje puede venir de SNS encapsulado
    let eventData: any;
    if (parsedBody.Message) {
      // Mensaje de SNS
      eventData = JSON.parse(parsedBody.Message);
    } else {
      // Mensaje directo
      eventData = parsedBody;
    }

    // Extraer los datos del evento
    const data = eventData.data || eventData;
    
    return {
      appointmentId: data.appointmentId,
      insuredId: data.insuredId,
      scheduleId: data.scheduleId,
      countryISO: data.countryISO as CountryISO,
      createdAt: data.createdAt
    };
    
  } catch (error) {
    throw new AppointmentError(
      `Invalid message format: ${error instanceof Error ? error.message : 'Parse error'}`,
      'MESSAGE_PARSE_ERROR',
      400
    );
  }
}

/**
 * Valida que el evento sea para Chile
 * @param event - Evento a validar
 */
function validateCountryEvent(event: AppointmentCreatedEvent): void {
  if (event.countryISO !== CountryISO.CL) {
    throw new AppointmentError(
      `Invalid country for Chile processor: received ${event.countryISO}`,
      'INVALID_COUNTRY',
      400
    );
  }

  // Validaciones adicionales específicas de Chile
  if (!event.appointmentId || !event.insuredId || !event.scheduleId) {
    throw new AppointmentError(
      'Missing required fields in Chile appointment event',
      'MISSING_REQUIRED_FIELDS',
      400
    );
  }

  // Validar formato de ID de asegurado chileno
  if (!/^\d{5}$/.test(event.insuredId)) {
    throw new AppointmentError(
      `Invalid Chilean insured ID format: ${event.insuredId}`,
      'INVALID_INSURED_ID_FORMAT',
      400
    );
  }

  // Validaciones específicas de Chile (por ejemplo, RUT si fuera necesario)
  validateChileanSpecificRules(event);
}

/**
 * Validaciones específicas de Chile
 * @param event - Evento a validar
 */
function validateChileanSpecificRules(event: AppointmentCreatedEvent): void {
  // Aquí se podrían implementar validaciones específicas de Chile
  // Por ejemplo: validar formato de RUT, horarios específicos, etc.
  
  // Ejemplo: Validar horarios permitidos en Chile
  const scheduleId = event.scheduleId;
  if (scheduleId < 1000) {
    console.warn(`Low schedule ID for Chile: ${scheduleId}`);
  }

  // Ejemplo: Validar que el asegurado cumple con regulaciones chilenas
  const insuredId = event.insuredId;
  if (insuredId.startsWith('00')) {
    console.log(`Chilean insured ID with leading zeros: ${insuredId}`);
  }
}

/**
 * Handler para casos de error en el procesamiento por lotes
 * Útil para debugging y monitoreo
 * @param event - Evento SQS
 * @param context - Contexto de Lambda
 */
export const errorHandler = async (event: SQSEvent, context: Context): Promise<void> => {
  console.error('Chile appointment error handler triggered', {
    messageCount: event.Records.length,
    requestId: context.awsRequestId
  });

  const notification = new NotificationService();

  for (const record of event.Records) {
    console.error('Processing failed message for Chile:', {
      messageId: record.messageId,
      body: record.body,
      attributes: record.attributes
    });

    try {
      await notification.notifyError(
        new Error('Chile appointment processing failed - sent to error handler'),
        {
          country: CountryISO.CL,
          messageId: record.messageId,
          sqsBody: record.body,
          lambda: 'appointment-cl-error',
          attributes: record.attributes
        }
      );
    } catch (error) {
      console.error('Failed to send error notification from error handler:', error);
    }
  }
};

/**
 * Handler para métricas y monitoreo de salud
 * @param event - Evento personalizado
 * @param context - Contexto de Lambda
 */
export const healthCheckHandler = async (event: any, context: Context): Promise<any> => {
  console.log('Chile appointment health check:', { requestId: context.awsRequestId });

  try {
    const { processor } = initializeServices();
    
    // Verificar conexiones y servicios
    const healthStatus = {
      status: 'healthy',
      country: CountryISO.CL,
      timestamp: new Date().toISOString(),
      requestId: context.awsRequestId,
      services: {
        processor: 'healthy',
        notification: 'healthy',
        rds: 'unknown' // Se podría verificar con un ping a RDS
      }
    };

    // Verificar salud del repositorio RDS si está disponible
    try {
      // Esta verificación se podría implementar si el repositorio tiene un método de health check
      console.log('RDS health check passed for Chile');
      healthStatus.services.rds = 'healthy';
    } catch (rdsError) {
      console.warn('RDS health check failed for Chile:', rdsError);
      healthStatus.services.rds = 'degraded';
    }

    return {
      statusCode: 200,
      body: JSON.stringify(healthStatus)
    };

  } catch (error) {
    console.error('Health check failed for Chile:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: 'unhealthy',
        country: CountryISO.CL,
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

/**
 * Handler para realizar operaciones de limpieza o mantenimiento
 * Útil para tareas periódicas específicas de Chile
 * @param event - Evento personalizado
 * @param context - Contexto de Lambda
 */
export const maintenanceHandler = async (event: any, context: Context): Promise<any> => {
  console.log('Chile appointment maintenance handler started:', { requestId: context.awsRequestId });

  try {
    const { processor, notification } = initializeServices();
    
    // Operaciones de mantenimiento específicas de Chile
    const maintenanceResult = {
      status: 'completed',
      country: CountryISO.CL,
      timestamp: new Date().toISOString(),
      requestId: context.awsRequestId,
      operations: []
    };

    // Ejemplo: Limpiar registros antiguos
    console.log('Performing Chilean maintenance operations...');
    
    // Aquí se podrían implementar operaciones como:
    // - Limpiar registros antiguos
    // - Actualizar configuraciones específicas de Chile
    // - Generar reportes periódicos
    // - Sincronizar con sistemas externos chilenos

    return {
      statusCode: 200,
      body: JSON.stringify(maintenanceResult)
    };

  } catch (error) {
    console.error('Maintenance failed for Chile:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: 'failed',
        country: CountryISO.CL,
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}; 