import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { 
  IAppointmentRDSRepository,
  AppointmentRDSEntity,
  AppointmentError,
  NotFoundError,
  CountryISO
} from '../types/appointment.types';

/**
 * Configuración de conexión RDS por país
 */
interface RDSConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port?: number;
}

/**
 * Repositorio de citas médicas para RDS MySQL
 * Implementa el patrón Repository para bases de datos relacionales
 * Usa el patrón Strategy para manejar diferentes configuraciones por país
 */
export class AppointmentRDSRepository implements IAppointmentRDSRepository {
  private connection: mysql.Connection | null = null;
  private readonly config: RDSConfig;

  constructor(
    private readonly countryISO: CountryISO,
    customConfig?: RDSConfig
  ) {
    this.config = customConfig || this.getConfigByCountry(countryISO);
  }

  /**
   * Obtiene la configuración de RDS según el país
   * Implementa el patrón Strategy
   * @param country - Código del país
   * @returns Configuración de RDS
   */
  private getConfigByCountry(country: CountryISO): RDSConfig {
    const baseConfig = {
      port: 3306,
      connectTimeout: 60000,
      supportBigNumbers: true,
      bigNumberStrings: true,
      timezone: '+00:00'
    };

    switch (country) {
      case CountryISO.PE:
        return {
          ...baseConfig,
          host: process.env.RDS_PE_HOST || 'localhost',
          user: process.env.RDS_PE_USER || 'admin',
          password: process.env.RDS_PE_PASSWORD || 'password',
          database: process.env.RDS_PE_DATABASE || 'appointments_pe'
        };
      case CountryISO.CL:
        return {
          ...baseConfig,
          host: process.env.RDS_CL_HOST || 'localhost',
          user: process.env.RDS_CL_USER || 'admin',
          password: process.env.RDS_CL_PASSWORD || 'password',
          database: process.env.RDS_CL_DATABASE || 'appointments_cl'
        };
      default:
        throw new AppointmentError(
          `Configuración de RDS no encontrada para el país: ${country}`,
          'CONFIG_ERROR'
        );
    }
  }

  /**
   * Establece la conexión con la base de datos con reintentos
   * @returns Conexión MySQL
   */
  private async getConnection(): Promise<mysql.Connection> {
    if (!this.connection) {
      const maxRetries = 3;
      let retries = 0;
      
      while (retries < maxRetries) {
        try {
          console.log(`Attempting to connect to RDS ${this.countryISO} (attempt ${retries + 1}/${maxRetries})`);
          this.connection = await mysql.createConnection(this.config);
          
          // Configurar timezone y charset
          await this.connection.execute('SET time_zone = "+00:00"');
          await this.connection.execute('SET NAMES utf8mb4');
          
          console.log(`Successfully connected to RDS ${this.countryISO}`);
          break;
          
        } catch (error) {
          retries++;
          console.error(`Connection attempt ${retries} failed for RDS ${this.countryISO}:`, error);
          
          if (retries >= maxRetries) {
            throw new AppointmentError(
              `Error al conectar con RDS ${this.countryISO} después de ${maxRetries} intentos: ${error instanceof Error ? error.message : 'Error desconocido'}`,
              'CONNECTION_ERROR'
            );
          }
          
          // Esperar antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    }
    
    // TypeScript guard: this should never happen due to the error handling above
    if (!this.connection) {
      throw new AppointmentError(
        `Error crítico: no se pudo establecer conexión con RDS ${this.countryISO}`,
        'CONNECTION_ERROR'
      );
    }
    
    return this.connection;
  }

  /**
   * Crea una nueva cita en la base de datos RDS
   * @param appointmentData - Datos de la cita (sin id, created_at, updated_at)
   * @returns Cita creada
   */
  async create(appointmentData: Omit<AppointmentRDSEntity, 'id' | 'created_at' | 'updated_at'>): Promise<AppointmentRDSEntity> {
    const connection = await this.getConnection();
    const id = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO appointments (
        id, insured_id, schedule_id, center_id, specialty_id, 
        medic_id, appointment_date, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      id,
      appointmentData.insured_id,
      appointmentData.schedule_id,
      appointmentData.center_id,
      appointmentData.specialty_id,
      appointmentData.medic_id,
      appointmentData.appointment_date,
      appointmentData.status,
      now,
      now
    ];

    try {
      await connection.execute(query, values);

      return {
        id,
        ...appointmentData,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new AppointmentError(
          'Ya existe una cita con estos datos',
          'DUPLICATE_ENTRY',
          409
        );
      }

      throw new AppointmentError(
        `Error al crear la cita en RDS ${this.countryISO}: ${error.message || 'Error desconocido'}`,
        'CREATE_RDS_ERROR'
      );
    }
  }

  /**
   * Busca una cita por su ID
   * @param id - ID de la cita
   * @returns Cita encontrada o null
   */
  async findById(id: string): Promise<AppointmentRDSEntity | null> {
    const connection = await this.getConnection();
    
    const query = `
      SELECT 
        id, insured_id, schedule_id, center_id, specialty_id,
        medic_id, appointment_date, status, created_at, updated_at
      FROM appointments 
      WHERE id = ?
    `;

    try {
      const [rows] = await connection.execute(query, [id]);
      const appointments = rows as AppointmentRDSEntity[];

      if (appointments.length === 0) {
        return null;
      }

      return this.mapRowToEntity(appointments[0]);
    } catch (error) {
      throw new AppointmentError(
        `Error al buscar la cita en RDS ${this.countryISO}: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'FIND_RDS_ERROR'
      );
    }
  }

  /**
   * Busca todas las citas de un asegurado
   * @param insuredId - ID del asegurado
   * @returns Lista de citas
   */
  async findByInsuredId(insuredId: string): Promise<AppointmentRDSEntity[]> {
    const connection = await this.getConnection();
    
    const query = `
      SELECT 
        id, insured_id, schedule_id, center_id, specialty_id,
        medic_id, appointment_date, status, created_at, updated_at
      FROM appointments 
      WHERE insured_id = ?
      ORDER BY created_at DESC
    `;

    try {
      const [rows] = await connection.execute(query, [insuredId]);
      const appointments = rows as AppointmentRDSEntity[];

      return appointments.map(row => this.mapRowToEntity(row));
    } catch (error) {
      throw new AppointmentError(
        `Error al buscar citas del asegurado en RDS ${this.countryISO}: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'FIND_BY_INSURED_RDS_ERROR'
      );
    }
  }

  /**
   * Actualiza el estado de una cita
   * @param id - ID de la cita
   * @param status - Nuevo estado
   */
  async updateStatus(id: string, status: string): Promise<void> {
    const connection = await this.getConnection();
    const now = new Date();

    const query = `
      UPDATE appointments 
      SET status = ?, updated_at = ?
      WHERE id = ?
    `;

    try {
      const [result] = await connection.execute(query, [status, now, id]);
      const updateResult = result as mysql.ResultSetHeader;

      if (updateResult.affectedRows === 0) {
        throw new NotFoundError(`Cita con ID ${id} no encontrada en RDS ${this.countryISO}`);
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }

      throw new AppointmentError(
        `Error al actualizar el estado en RDS ${this.countryISO}: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        'UPDATE_STATUS_RDS_ERROR'
      );
    }
  }

  /**
   * Verifica si existe una cita para el mismo schedule_id
   * @param scheduleId - ID del horario
   * @returns true si existe
   */
  async existsByScheduleId(scheduleId: number): Promise<boolean> {
    const connection = await this.getConnection();
    
    const query = `
      SELECT COUNT(*) as count 
      FROM appointments 
      WHERE schedule_id = ? AND status IN ('pending', 'processing', 'completed')
    `;

    try {
      const [rows] = await connection.execute(query, [scheduleId]);
      const result = rows as Array<{ count: number }>;
      
      return (result[0]?.count ?? 0) > 0;
    } catch (error) {
      // En caso de error, permitir la creación (fail-safe)
      console.error(`Error checking schedule availability in RDS ${this.countryISO}:`, error);
      return false;
    }
  }

  /**
   * Mapea una fila de la base de datos a una entidad
   * @param row - Fila de la base de datos
   * @returns Entidad mapeada
   */
  private mapRowToEntity(row: any): AppointmentRDSEntity {
    return {
      id: row.id,
      insured_id: row.insured_id,
      schedule_id: row.schedule_id,
      center_id: row.center_id,
      specialty_id: row.specialty_id,
      medic_id: row.medic_id,
      appointment_date: row.appointment_date,
      status: row.status,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
    };
  }

  /**
   * Cierra la conexión con la base de datos
   */
  async closeConnection(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  /**
   * Método para verificar la salud de la conexión
   * @returns true si la conexión está activa
   */
  async isHealthy(): Promise<boolean> {
    try {
      const connection = await this.getConnection();
      await connection.execute('SELECT 1');
      return true;
    } catch (error) {
      return false;
    }
  }
} 