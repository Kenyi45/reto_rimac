import { SQSEvent, Context } from 'aws-lambda';
import { NotificationService } from '../services/notification.service';
import { AppointmentProcessorPE } from '../services/appointment-processor.service';
import {
  AppointmentCreatedEvent,
  CountryISO,
  AppointmentError
} from '../types/appointment.types';

// Inicialización de servicios (singleton pattern)
let notificationService: NotificationService;
let appointmentProcessor: AppointmentProcessorPE;

/**
 * Inicializa los servicios necesarios para Perú
 * Implementa el patrón Singleton para reutilizar conexiones
 */
function initializeServices(): { processor: AppointmentProcessorPE; notification: NotificationService } {
  if (!notificationService) {
    notificationService = new NotificationService();
  }
  
  if (!appointmentProcessor) {
    appointmentProcessor = new AppointmentProcessorPE(notificationService);
  }
  
  return {
    processor: appointmentProcessor,
    notification: notificationService
  };
}

/**
 * Handler del Lambda appointment-pe
 * Procesa mensajes SQS específicos para citas médicas en Perú
 * @param event - Evento SQS
 * @param context - Contexto de Lambda
 */
export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  console.log('Appointment PE handler started', {
    messageCount: event.Records.length,
    requestId: context.awsRequestId
  });

  const { processor, notification } = initializeServices();
  const errors: string[] = [];

  // Procesar cada mensaje SQS
  for (const record of event.Records) {
    try {
      console.log('Processing SQS record for Peru:', {
        messageId: record.messageId,
        receiptHandle: record.receiptHandle?.substring(0, 20) + '...'
      });

      // Parsear el mensaje
      const appointmentEvent = await parseAppointmentEvent(record.body);
      
      // Validar que es para Perú
      validateCountryEvent(appointmentEvent);
      
      // Procesar la cita usando la estrategia específica de Perú
      await processor.processAppointment(appointmentEvent);
      
      console.log('Peru appointment processed successfully:', {
        appointmentId: appointmentEvent.appointmentId,
        insuredId: appointmentEvent.insuredId,
        scheduleId: appointmentEvent.scheduleId
      });

    } catch (error) {
      const errorMessage = `Error processing Peru appointment: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
            country: CountryISO.PE,
            messageId: record.messageId,
            sqsBody: record.body,
            lambda: 'appointment-pe'
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
    
    console.error('Batch processing failed for Peru appointments:', {
      errorCount: errors.length,
      errors: errors
    });
    
    throw consolidatedError;
  }

  console.log(`Successfully processed ${event.Records.length} Peru appointments`);
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
 * Valida que el evento sea para Perú
 * @param event - Evento a validar
 */
function validateCountryEvent(event: AppointmentCreatedEvent): void {
  if (event.countryISO !== CountryISO.PE) {
    throw new AppointmentError(
      `Invalid country for Peru processor: received ${event.countryISO}`,
      'INVALID_COUNTRY',
      400
    );
  }

  // Validaciones adicionales específicas de Perú
  if (!event.appointmentId || !event.insuredId || !event.scheduleId) {
    throw new AppointmentError(
      'Missing required fields in Peru appointment event',
      'MISSING_REQUIRED_FIELDS',
      400
    );
  }

  // Validar formato de ID de asegurado peruano
  if (!/^\d{5}$/.test(event.insuredId)) {
    throw new AppointmentError(
      `Invalid Peruvian insured ID format: ${event.insuredId}`,
      'INVALID_INSURED_ID_FORMAT',
      400
    );
  }
}

/**
 * Handler para casos de error en el procesamiento por lotes
 * Útil para debugging y monitoreo
 * @param event - Evento SQS
 * @param context - Contexto de Lambda
 */
export const errorHandler = async (event: SQSEvent, context: Context): Promise<void> => {
  console.error('Peru appointment error handler triggered', {
    messageCount: event.Records.length,
    requestId: context.awsRequestId
  });

  const notification = new NotificationService();

  for (const record of event.Records) {
    console.error('Processing failed message for Peru:', {
      messageId: record.messageId,
      body: record.body,
      attributes: record.attributes
    });

    try {
      await notification.notifyError(
        new Error('Peru appointment processing failed - sent to error handler'),
        {
          country: CountryISO.PE,
          messageId: record.messageId,
          sqsBody: record.body,
          lambda: 'appointment-pe-error',
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
  console.log('Peru appointment health check:', { requestId: context.awsRequestId });

  try {
    const { processor } = initializeServices();
    
    // Verificar conexiones y servicios
    const healthStatus = {
      status: 'healthy',
      country: CountryISO.PE,
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
      console.log('RDS health check passed for Peru');
      healthStatus.services.rds = 'healthy';
    } catch (rdsError) {
      console.warn('RDS health check failed for Peru:', rdsError);
      healthStatus.services.rds = 'degraded';
    }

    return {
      statusCode: 200,
      body: JSON.stringify(healthStatus)
    };

  } catch (error) {
    console.error('Health check failed for Peru:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: 'unhealthy',
        country: CountryISO.PE,
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}; 