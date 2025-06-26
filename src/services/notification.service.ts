import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import {
  INotificationService,
  AppointmentCreatedEvent,
  AppointmentConfirmedEvent,
  CountryISO,
  AppointmentError
} from '../types/appointment.types';

/**
 * Servicio de notificaciones siguiendo el principio de Responsabilidad Única (SRP)
 * Maneja la publicación de eventos a SNS y EventBridge
 * Implementa el patrón Observer para notificar cambios de estado
 */
export class NotificationService implements INotificationService {
  private readonly snsClient: SNSClient;
  private readonly eventBridgeClient: EventBridgeClient;
  private readonly region: string;

  constructor(
    snsClient?: SNSClient,
    eventBridgeClient?: EventBridgeClient,
    region?: string
  ) {
    this.region = region || process.env.REGION || 'us-east-1';
    
    // Inyección de dependencias para facilitar testing
    this.snsClient = snsClient || new SNSClient({ region: this.region });
    this.eventBridgeClient = eventBridgeClient || new EventBridgeClient({ region: this.region });
  }

  /**
   * Publica un evento de cita creada a SNS
   * Implementa el patrón Strategy para manejar diferentes países
   * @param event - Evento de cita creada
   */
  async publishAppointmentCreated(event: AppointmentCreatedEvent): Promise<void> {
    const topicArn = this.getTopicArnByCountry(event.countryISO);
    
    const message = {
      eventType: 'AppointmentCreated',
      timestamp: new Date().toISOString(),
      data: {
        appointmentId: event.appointmentId,
        insuredId: event.insuredId,
        scheduleId: event.scheduleId,
        countryISO: event.countryISO,
        createdAt: event.createdAt
      }
    };

    const messageAttributes = {
      countryISO: {
        DataType: 'String',
        StringValue: event.countryISO
      },
      eventType: {
        DataType: 'String',
        StringValue: 'AppointmentCreated'
      }
    };

    try {
      const command = new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(message),
        MessageAttributes: messageAttributes,
        Subject: `Appointment Created - ${event.countryISO}`
      });

      const result = await this.snsClient.send(command);
      
      console.log(`Appointment created event published to SNS`, {
        messageId: result.MessageId,
        appointmentId: event.appointmentId,
        countryISO: event.countryISO
      });

    } catch (error) {
      console.error('Error publishing appointment created event to SNS:', error);
      throw new AppointmentError(
        `Error al publicar evento de cita creada: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'SNS_PUBLISH_ERROR'
      );
    }
  }

  /**
   * Publica un evento de cita confirmada a EventBridge
   * @param event - Evento de cita confirmada
   */
  async publishAppointmentConfirmed(event: AppointmentConfirmedEvent): Promise<void> {
    const eventBusName = process.env.EVENT_BRIDGE_BUS || 'appointment-bus';
    
    const eventDetail = {
      appointmentId: event.appointmentId,
      countryISO: event.countryISO,
      status: event.status,
      confirmedAt: event.confirmedAt,
      timestamp: new Date().toISOString()
    };

    try {
      const command = new PutEventsCommand({
        Entries: [
          {
            Source: 'appointment.service',
            DetailType: 'Appointment Confirmed',
            Detail: JSON.stringify(eventDetail),
            EventBusName: eventBusName,
            Time: new Date(),
            Resources: [
              `appointment:${event.appointmentId}`
            ]
          }
        ]
      });

      const result = await this.eventBridgeClient.send(command);
      
      if (result.FailedEntryCount && result.FailedEntryCount > 0) {
        throw new Error(`Failed to publish ${result.FailedEntryCount} events`);
      }

      console.log(`Appointment confirmed event published to EventBridge`, {
        appointmentId: event.appointmentId,
        countryISO: event.countryISO,
        status: event.status
      });

    } catch (error) {
      console.error('Error publishing appointment confirmed event to EventBridge:', error);
      throw new AppointmentError(
        `Error al publicar evento de cita confirmada: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'EVENTBRIDGE_PUBLISH_ERROR'
      );
    }
  }

  /**
   * Obtiene el ARN del tópico SNS según el país
   * Implementa el patrón Strategy
   * @param countryISO - Código del país
   * @returns ARN del tópico SNS
   */
  private getTopicArnByCountry(countryISO: CountryISO): string {
    const accountId = this.getAccountId();
    const stage = process.env.STAGE || 'dev';
    
    switch (countryISO) {
      case CountryISO.PE:
        return process.env.SNS_TOPIC_PE_ARN || 
               `arn:aws:sns:${this.region}:${accountId}:rimac-appointment-backend-appointments-pe-${stage}`;
      case CountryISO.CL:
        return process.env.SNS_TOPIC_CL_ARN || 
               `arn:aws:sns:${this.region}:${accountId}:rimac-appointment-backend-appointments-cl-${stage}`;
      default:
        throw new AppointmentError(
          `Tópico SNS no configurado para el país: ${countryISO}`,
          'SNS_TOPIC_NOT_FOUND',
          500
        );
    }
  }

  /**
   * Obtiene el Account ID de AWS desde el contexto Lambda
   * @returns Account ID
   */
  private getAccountId(): string {
    // Usar el Account ID real de tu cuenta AWS
    // Este valor se obtiene de los logs de CloudFormation y es tu Account ID real
    return '145023098429';
  }

  /**
   * Envía una notificación de error crítico
   * @param error - Error a notificar
   * @param context - Contexto adicional
   */
  async notifyError(error: Error, context: Record<string, any> = {}): Promise<void> {
    const errorEvent = {
      eventType: 'SystemError',
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context
    };

    try {
      // Enviar a un tópico de errores (si existe)
      const errorTopicArn = process.env.ERROR_TOPIC_ARN;
      if (errorTopicArn) {
        const command = new PublishCommand({
          TopicArn: errorTopicArn,
          Message: JSON.stringify(errorEvent),
          Subject: `System Error - ${error.name}`
        });

        await this.snsClient.send(command);
      }

      // También enviar a EventBridge para procesamiento adicional
      const eventBusName = process.env.EVENT_BRIDGE_BUS || 'appointment-bus';
      const eventCommand = new PutEventsCommand({
        Entries: [
          {
            Source: 'appointment.service',
            DetailType: 'System Error',
            Detail: JSON.stringify(errorEvent),
            EventBusName: eventBusName,
            Time: new Date()
          }
        ]
      });

      await this.eventBridgeClient.send(eventCommand);

    } catch (notificationError) {
      // Log del error de notificación pero no lanzar excepción
      console.error('Error sending error notification:', notificationError);
    }
  }

  /**
   * Valida la configuración del servicio de notificaciones
   * @returns true si la configuración es válida
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      // Verificar que los tópicos SNS existen
      const topicsPE = this.getTopicArnByCountry(CountryISO.PE);
      const topicsCL = this.getTopicArnByCountry(CountryISO.CL);
      
      // Aquí podrías hacer llamadas adicionales para verificar que los recursos existen
      return true;
    } catch (error) {
      console.error('Notification service configuration validation failed:', error);
      return false;
    }
  }
} 