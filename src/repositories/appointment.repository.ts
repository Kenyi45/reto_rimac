import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  QueryCommand, 
  UpdateCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { 
  Appointment, 
  AppointmentStatus, 
  IAppointmentRepository,
  AppointmentEntity,
  NotFoundError,
  AppointmentError
} from '../types/appointment.types';

/**
 * Repositorio de citas médicas para DynamoDB
 * Implementa el patrón Repository y sigue el principio de Responsabilidad Única (SRP)
 * Está abierto para extensión pero cerrado para modificación (OCP)
 */
export class AppointmentRepository implements IAppointmentRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(
    private readonly dynamoClient?: DynamoDBClient,
    tableName?: string
  ) {
    this.tableName = tableName || process.env.APPOINTMENTS_TABLE || 'appointments';
    
    // Inyección de dependencias - permite testing más fácil
    const client = dynamoClient || new DynamoDBClient({ 
      region: process.env.REGION || 'us-east-1' 
    });
    
    this.docClient = DynamoDBDocumentClient.from(client);
  }

  /**
   * Crea una nueva cita médica en DynamoDB
   * @param appointmentData - Datos de la cita a crear
   * @returns Cita creada
   */
  async create(appointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Appointment> {
    const now = new Date().toISOString();
    const appointment: Appointment = {
      id: uuidv4(),
      ...appointmentData,
      createdAt: now,
      updatedAt: now
    };

    const entity: AppointmentEntity = this.toEntity(appointment);

    try {
      await this.docClient.send(new PutCommand({
        TableName: this.tableName,
        Item: entity,
        ConditionExpression: 'attribute_not_exists(id)'
      }));

      return appointment;
    } catch (error) {
      throw new AppointmentError(
        `Error al crear la cita: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'CREATE_ERROR'
      );
    }
  }

  /**
   * Busca una cita por su ID
   * @param id - ID de la cita
   * @returns Cita encontrada o null
   */
  async findById(id: string): Promise<Appointment | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: this.tableName,
        Key: { id }
      }));

      if (!result.Item) {
        return null;
      }

      return this.fromEntity(result.Item as AppointmentEntity);
    } catch (error) {
      throw new AppointmentError(
        `Error al buscar la cita: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'FIND_ERROR'
      );
    }
  }

  /**
   * Busca todas las citas de un asegurado
   * @param insuredId - ID del asegurado
   * @returns Lista de citas del asegurado
   */
  async findByInsuredId(insuredId: string): Promise<Appointment[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'InsuredIdIndex',
        KeyConditionExpression: 'insuredId = :insuredId',
        ExpressionAttributeValues: {
          ':insuredId': insuredId
        },
        ScanIndexForward: false // Ordenar por fecha de creación descendente
      }));

      if (!result.Items || result.Items.length === 0) {
        return [];
      }

      return result.Items.map(item => this.fromEntity(item as AppointmentEntity));
    } catch (error) {
      throw new AppointmentError(
        `Error al buscar citas del asegurado: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'FIND_BY_INSURED_ERROR'
      );
    }
  }

  /**
   * Actualiza el estado de una cita
   * @param id - ID de la cita
   * @param status - Nuevo estado
   */
  async updateStatus(id: string, status: AppointmentStatus): Promise<void> {
    const updatedAt = new Date().toISOString();

    try {
      const result = await this.docClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { id },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updatedAt': updatedAt
        },
        ConditionExpression: 'attribute_exists(id)',
        ReturnValues: 'NONE'
      }));

    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError(`Cita con ID ${id} no encontrada`);
      }
      
      throw new AppointmentError(
        `Error al actualizar el estado de la cita: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'UPDATE_STATUS_ERROR'
      );
    }
  }

  /**
   * Convierte de modelo de dominio a entidad de DynamoDB
   * @param appointment - Modelo de dominio
   * @returns Entidad para DynamoDB
   */
  private toEntity(appointment: Appointment): AppointmentEntity {
    return {
      id: appointment.id,
      insuredId: appointment.insuredId,
      scheduleId: appointment.scheduleId,
      countryISO: appointment.countryISO.toString(),
      status: appointment.status.toString(),
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt
    };
  }

  /**
   * Convierte de entidad de DynamoDB a modelo de dominio
   * @param entity - Entidad de DynamoDB
   * @returns Modelo de dominio
   */
  private fromEntity(entity: AppointmentEntity): Appointment {
    return {
      id: entity.id,
      insuredId: entity.insuredId,
      scheduleId: entity.scheduleId,
      countryISO: entity.countryISO as any, // Se valida en el servicio
      status: entity.status as AppointmentStatus,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }

  /**
   * Verifica si existe una cita con el mismo scheduleId y estado pending/processing
   * Útil para evitar citas duplicadas
   * @param scheduleId - ID del horario
   * @returns true si existe una cita conflictiva
   */
  async hasConflictingAppointment(scheduleId: number): Promise<boolean> {
    try {
      const result = await this.docClient.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'scheduleId = :scheduleId AND (#status = :pending OR #status = :processing)',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':scheduleId': scheduleId,
          ':pending': AppointmentStatus.PENDING,
          ':processing': AppointmentStatus.PROCESSING
        },
        Limit: 1
      }));

      return (result.Items && result.Items.length > 0) || false;
    } catch (error) {
      // En caso de error, permitir la creación (fail-safe)
      console.error('Error checking conflicting appointments:', error);
      return false;
    }
  }
} 