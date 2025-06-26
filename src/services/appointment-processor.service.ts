import {
  CountryISO,
  AppointmentCreatedEvent,
  AppointmentConfirmedEvent,
  AppointmentStatus,
  IAppointmentRDSRepository,
  INotificationService,
  AppointmentError,
  AppointmentRDSEntity
} from '../types/appointment.types';
import { AppointmentRDSRepository } from '../repositories/appointment-rds.repository';

/**
 * Interface para el procesador de citas por país
 * Implementa el patrón Strategy
 */
interface IAppointmentProcessor {
  processAppointment(event: AppointmentCreatedEvent): Promise<void>;
  getCountry(): CountryISO;
}

/**
 * Clase abstracta base para procesadores de citas
 * Implementa el patrón Template Method
 */
abstract class BaseAppointmentProcessor implements IAppointmentProcessor {
  protected readonly rdsRepository: IAppointmentRDSRepository;
  protected readonly notificationService: INotificationService;
  protected readonly country: CountryISO;

  constructor(
    country: CountryISO,
    notificationService: INotificationService,
    rdsRepository?: IAppointmentRDSRepository
  ) {
    this.country = country;
    this.notificationService = notificationService;
    this.rdsRepository = rdsRepository || new AppointmentRDSRepository(country);
  }

  /**
   * Procesa una cita médica (Template Method)
   * @param event - Evento de cita creada
   */
  async processAppointment(event: AppointmentCreatedEvent): Promise<void> {
    try {
      console.log(`Processing appointment for ${this.country}:`, event);

      // 1. Validar el evento
      this.validateEvent(event);

      // 2. Ejecutar lógica específica del país (hook method)
      await this.executeCountrySpecificLogic(event);

      // 3. Obtener información del horario
      const scheduleInfo = await this.getScheduleInformation(event.scheduleId);

      // 4. Crear registro en RDS
      const rdsEntity = await this.createRDSRecord(event, scheduleInfo);

      // 5. Publicar confirmación
      await this.publishConfirmation(event, rdsEntity);

      console.log(`Appointment processed successfully for ${this.country}:`, event.appointmentId);

    } catch (error) {
      console.error(`Error processing appointment for ${this.country}:`, error);
      
      // Notificar error crítico
      await this.notificationService.notifyError(
        error instanceof Error ? error : new Error('Unknown error'),
        {
          appointmentId: event.appointmentId,
          country: this.country,
          scheduleId: event.scheduleId
        }
      );

      throw error;
    }
  }

  getCountry(): CountryISO {
    return this.country;
  }

  // Métodos que pueden ser sobrescritos por las implementaciones concretas

  /**
   * Ejecuta lógica específica del país
   * Hook method que puede ser sobrescrito
   * @param event - Evento de cita creada
   */
  protected async executeCountrySpecificLogic(event: AppointmentCreatedEvent): Promise<void> {
    // Implementación por defecto - puede ser sobrescrita
    console.log(`Executing default logic for ${this.country}`);
  }

  /**
   * Obtiene información adicional del horario
   * @param scheduleId - ID del horario
   * @returns Información del horario
   */
  protected async getScheduleInformation(scheduleId: number): Promise<ScheduleInfo> {
    // Simulación de obtener información del horario
    // En un caso real, esto consultaría un servicio o base de datos
    return {
      centerId: Math.floor(scheduleId / 1000) || 1,
      specialtyId: Math.floor((scheduleId % 1000) / 100) || 1,
      medicId: Math.floor((scheduleId % 100) / 10) || 1,
      appointmentDate: new Date().toISOString()
    };
  }

  /**
   * Crea el registro en la base de datos RDS
   * @param event - Evento de cita creada
   * @param scheduleInfo - Información del horario
   * @returns Entidad creada
   */
  protected async createRDSRecord(
    event: AppointmentCreatedEvent, 
    scheduleInfo: ScheduleInfo
  ): Promise<AppointmentRDSEntity> {
    const appointmentData: Omit<AppointmentRDSEntity, 'id' | 'created_at' | 'updated_at'> = {
      insured_id: event.insuredId,
      schedule_id: event.scheduleId,
      center_id: scheduleInfo.centerId,
      specialty_id: scheduleInfo.specialtyId,
      medic_id: scheduleInfo.medicId,
      appointment_date: scheduleInfo.appointmentDate,
      status: AppointmentStatus.PROCESSING
    };

    return await this.rdsRepository.create(appointmentData);
  }

  /**
   * Publica la confirmación de la cita
   * @param event - Evento original
   * @param rdsEntity - Entidad creada en RDS
   */
  protected async publishConfirmation(
    event: AppointmentCreatedEvent, 
    rdsEntity: AppointmentRDSEntity
  ): Promise<void> {
    const confirmationEvent: AppointmentConfirmedEvent = {
      appointmentId: event.appointmentId,
      countryISO: this.country,
      status: AppointmentStatus.COMPLETED,
      confirmedAt: new Date().toISOString()
    };

    await this.notificationService.publishAppointmentConfirmed(confirmationEvent);
  }

  /**
   * Valida el evento recibido
   * @param event - Evento a validar
   */
  private validateEvent(event: AppointmentCreatedEvent): void {
    if (!event.appointmentId) {
      throw new AppointmentError('Appointment ID is required', 'VALIDATION_ERROR', 400);
    }

    if (!event.insuredId) {
      throw new AppointmentError('Insured ID is required', 'VALIDATION_ERROR', 400);
    }

    if (!event.scheduleId || event.scheduleId <= 0) {
      throw new AppointmentError('Valid Schedule ID is required', 'VALIDATION_ERROR', 400);
    }

    if (event.countryISO !== this.country) {
      throw new AppointmentError(
        `Country mismatch: expected ${this.country}, got ${event.countryISO}`,
        'VALIDATION_ERROR',
        400
      );
    }
  }
}

/**
 * Procesador específico para Perú
 * Implementa lógica específica del país peruano
 */
export class AppointmentProcessorPE extends BaseAppointmentProcessor {
  constructor(notificationService: INotificationService, rdsRepository?: IAppointmentRDSRepository) {
    super(CountryISO.PE, notificationService, rdsRepository);
  }

  /**
   * Lógica específica para Perú
   * @param event - Evento de cita creada
   */
  protected override async executeCountrySpecificLogic(event: AppointmentCreatedEvent): Promise<void> {
    console.log('Executing Peru-specific appointment logic');
    
    // Validaciones específicas de Perú
    await this.validatePeruvianInsuredId(event.insuredId);
    
    // Lógica de negocio específica de Perú
    await this.applyPeruvianBusinessRules(event);
    
    // Logging específico
    console.log(`Peru appointment processing for insured: ${event.insuredId}`);
  }

  /**
   * Valida el ID del asegurado según reglas peruanas
   * @param insuredId - ID del asegurado
   */
  private async validatePeruvianInsuredId(insuredId: string): Promise<void> {
    // Validación específica para Perú
    // Por ejemplo, validar contra un padrón nacional
    if (insuredId.startsWith('00')) {
      console.warn(`Peruvian insured ID starts with 00: ${insuredId}`);
    }
  }

  /**
   * Aplica reglas de negocio específicas de Perú
   * @param event - Evento de cita creada
   */
  private async applyPeruvianBusinessRules(event: AppointmentCreatedEvent): Promise<void> {
    // Ejemplo: Verificar horarios permitidos en Perú
    // Ejemplo: Aplicar tarifas específicas
    // Ejemplo: Validar contra regulaciones locales
    
    console.log(`Applying Peruvian business rules for schedule ${event.scheduleId}`);
  }
}

/**
 * Procesador específico para Chile
 * Implementa lógica específica del país chileno
 */
export class AppointmentProcessorCL extends BaseAppointmentProcessor {
  constructor(notificationService: INotificationService, rdsRepository?: IAppointmentRDSRepository) {
    super(CountryISO.CL, notificationService, rdsRepository);
  }

  /**
   * Lógica específica para Chile
   * @param event - Evento de cita creada
   */
  protected override async executeCountrySpecificLogic(event: AppointmentCreatedEvent): Promise<void> {
    console.log('Executing Chile-specific appointment logic');
    
    // Validaciones específicas de Chile
    await this.validateChileanInsuredId(event.insuredId);
    
    // Lógica de negocio específica de Chile
    await this.applyChileanBusinessRules(event);
    
    // Logging específico
    console.log(`Chile appointment processing for insured: ${event.insuredId}`);
  }

  /**
   * Valida el ID del asegurado según reglas chilenas
   * @param insuredId - ID del asegurado
   */
  private async validateChileanInsuredId(insuredId: string): Promise<void> {
    // Validación específica para Chile
    // Por ejemplo, validar RUT chileno
    console.log(`Validating Chilean insured ID: ${insuredId}`);
  }

  /**
   * Aplica reglas de negocio específicas de Chile
   * @param event - Evento de cita creada
   */
  private async applyChileanBusinessRules(event: AppointmentCreatedEvent): Promise<void> {
    // Ejemplo: Verificar horarios permitidos en Chile
    // Ejemplo: Aplicar regulaciones chilenas
    // Ejemplo: Integración con sistemas chilenos
    
    console.log(`Applying Chilean business rules for schedule ${event.scheduleId}`);
  }
}

/**
 * Factory para crear procesadores por país
 * Implementa el patrón Factory Method
 */
export class AppointmentProcessorFactory {
  static create(
    country: CountryISO, 
    notificationService: INotificationService
  ): IAppointmentProcessor {
    switch (country) {
      case CountryISO.PE:
        return new AppointmentProcessorPE(notificationService);
      case CountryISO.CL:
        return new AppointmentProcessorCL(notificationService);
      default:
        throw new AppointmentError(
          `Unsupported country for appointment processing: ${country}`,
          'UNSUPPORTED_COUNTRY',
          400
        );
    }
  }
}

// Tipo auxiliar para información del horario
interface ScheduleInfo {
  centerId: number;
  specialtyId: number;
  medicId: number;
  appointmentDate: string;
} 