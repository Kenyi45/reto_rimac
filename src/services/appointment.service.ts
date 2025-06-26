import {
  AppointmentRequest,
  Appointment,
  AppointmentResponse,
  AppointmentListResponse,
  AppointmentStatus,
  CountryISO,
  AppointmentCreatedEvent,
  IAppointmentRepository,
  INotificationService,
  IValidationService,
  IScheduleService,
  AppointmentError,
  ValidationError,
  NotFoundError,
  ConflictError
} from '../types/appointment.types';

/**
 * Servicio principal de citas médicas
 * Implementa la lógica de negocio siguiendo los principios SOLID:
 * - SRP: Responsabilidad única de gestionar citas médicas
 * - OCP: Abierto para extensión, cerrado para modificación
 * - LSP: Las implementaciones pueden ser sustituidas
 * - ISP: Interfaces segregadas y específicas
 * - DIP: Depende de abstracciones, no de concreciones
 */
export class AppointmentService {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly notificationService: INotificationService,
    private readonly validationService: IValidationService,
    private readonly scheduleService?: IScheduleService
  ) {}

  /**
   * Crea una nueva cita médica
   * Implementa el patrón Template Method para el flujo de creación
   * @param requestData - Datos de la solicitud
   * @returns Respuesta con el resultado
   */
  async createAppointment(requestData: unknown): Promise<AppointmentResponse> {
    try {
      // 1. Validar la solicitud
      const validatedRequest = await this.validateRequest(requestData);
      
      // 2. Verificar disponibilidad del horario (si el servicio está disponible)
      await this.checkScheduleAvailability(validatedRequest.scheduleId);
      
      // 3. Verificar conflictos existentes
      await this.checkExistingConflicts(validatedRequest.scheduleId);
      
      // 4. Crear la cita en DynamoDB
      const appointment = await this.createAppointmentRecord(validatedRequest);
      
      // 5. Publicar evento de cita creada
      await this.publishCreatedEvent(appointment);
      
      // 6. Retornar respuesta exitosa
      return this.buildSuccessResponse(appointment);
      
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Obtiene todas las citas de un asegurado
   * @param insuredId - ID del asegurado
   * @returns Lista de citas
   */
  async getAppointmentsByInsuredId(insuredId: string): Promise<AppointmentListResponse> {
    try {
      // 1. Validar el ID del asegurado
      this.validateInsuredIdFormat(insuredId);
      
      // 2. Buscar citas en el repositorio
      const appointments = await this.appointmentRepository.findByInsuredId(insuredId);
      
      // 3. Enriquecer con información del horario (si está disponible)
      const enrichedAppointments = await this.enrichAppointmentsWithSchedule(appointments);
      
      return {
        success: true,
        data: enrichedAppointments,
        total: enrichedAppointments.length
      };
      
    } catch (error) {
      console.error('Error getting appointments by insured ID:', error);
      
      if (error instanceof ValidationError) {
        return {
          success: false,
          data: [],
          total: 0
        };
      }
      
      throw error;
    }
  }

  /**
   * Actualiza el estado de una cita (usado por los lambdas de confirmación)
   * @param appointmentId - ID de la cita
   * @param status - Nuevo estado
   */
  async updateAppointmentStatus(appointmentId: string, status: AppointmentStatus): Promise<void> {
    try {
      // 1. Validar que la cita existe
      const existingAppointment = await this.appointmentRepository.findById(appointmentId);
      if (!existingAppointment) {
        throw new NotFoundError(`Cita con ID ${appointmentId} no encontrada`);
      }
      
      // 2. Validar transición de estado
      this.validateStatusTransition(existingAppointment.status, status);
      
      // 3. Actualizar el estado
      await this.appointmentRepository.updateStatus(appointmentId, status);
      
      console.log(`Appointment ${appointmentId} status updated to ${status}`);
      
    } catch (error) {
      console.error(`Error updating appointment ${appointmentId} status:`, error);
      throw error;
    }
  }

  /**
   * Obtiene una cita por su ID
   * @param appointmentId - ID de la cita
   * @returns Cita encontrada
   */
  async getAppointmentById(appointmentId: string): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findById(appointmentId);
    
    if (!appointment) {
      throw new NotFoundError(`Cita con ID ${appointmentId} no encontrada`);
    }
    
    return appointment;
  }

  // Métodos privados para implementar Template Method Pattern

  /**
   * Valida la solicitud de cita
   * @param requestData - Datos a validar
   * @returns Solicitud validada
   */
  private async validateRequest(requestData: unknown): Promise<AppointmentRequest> {
    return this.validationService.validateAppointmentRequest(requestData);
  }

  /**
   * Verifica la disponibilidad del horario
   * @param scheduleId - ID del horario
   */
  private async checkScheduleAvailability(scheduleId: number): Promise<void> {
    if (this.scheduleService) {
      const isAvailable = await this.scheduleService.validateScheduleAvailability(scheduleId);
      if (!isAvailable) {
        throw new ConflictError(`El horario ${scheduleId} no está disponible`);
      }
    }
  }

  /**
   * Verifica conflictos con citas existentes
   * @param scheduleId - ID del horario
   */
  private async checkExistingConflicts(scheduleId: number): Promise<void> {
    const hasConflict = await this.appointmentRepository.hasConflictingAppointment(scheduleId);
    if (hasConflict) {
      throw new ConflictError(`Ya existe una cita para el horario ${scheduleId}`);
    }
  }

  /**
   * Crea el registro de la cita en DynamoDB
   * @param request - Solicitud validada
   * @returns Cita creada
   */
  private async createAppointmentRecord(request: AppointmentRequest): Promise<Appointment> {
    return await this.appointmentRepository.create({
      insuredId: request.insuredId,
      scheduleId: request.scheduleId,
      countryISO: request.countryISO,
      status: AppointmentStatus.PENDING
    });
  }

  /**
   * Publica el evento de cita creada
   * @param appointment - Cita creada
   */
  private async publishCreatedEvent(appointment: Appointment): Promise<void> {
    const event: AppointmentCreatedEvent = {
      appointmentId: appointment.id,
      insuredId: appointment.insuredId,
      scheduleId: appointment.scheduleId,
      countryISO: appointment.countryISO,
      createdAt: appointment.createdAt
    };

    await this.notificationService.publishAppointmentCreated(event);
  }

  /**
   * Construye la respuesta exitosa
   * @param appointment - Cita creada
   * @returns Respuesta exitosa
   */
  private buildSuccessResponse(appointment: Appointment): AppointmentResponse {
    return {
      success: true,
      message: 'El agendamiento está en proceso',
      data: {
        appointmentId: appointment.id,
        status: appointment.status
      }
    };
  }

  /**
   * Maneja errores y retorna respuesta apropiada
   * @param error - Error a manejar
   * @returns Respuesta de error
   */
  private handleError(error: unknown): AppointmentResponse {
    console.error('Error in appointment service:', error);

    if (error instanceof ValidationError) {
      return {
        success: false,
        message: 'Datos de solicitud inválidos',
        error: error.message
      };
    }

    if (error instanceof ConflictError) {
      return {
        success: false,
        message: 'Conflicto en la solicitud',
        error: error.message
      };
    }

    if (error instanceof AppointmentError) {
      return {
        success: false,
        message: 'Error en el procesamiento',
        error: error.message
      };
    }

    return {
      success: false,
      message: 'Error interno del servidor',
      error: 'Ha ocurrido un error inesperado'
    };
  }

  /**
   * Valida el formato del ID del asegurado
   * @param insuredId - ID a validar
   */
  private validateInsuredIdFormat(insuredId: string): void {
    if (!this.validationService.validateInsuredId(insuredId)) {
      throw new ValidationError(`ID de asegurado inválido: ${insuredId}`);
    }
  }

  /**
   * Enriquece las citas con información del horario
   * @param appointments - Lista de citas
   * @returns Citas enriquecidas
   */
  private async enrichAppointmentsWithSchedule(appointments: Appointment[]): Promise<Appointment[]> {
    if (!this.scheduleService || appointments.length === 0) {
      return appointments;
    }

    const enrichedAppointments: Appointment[] = [];

    for (const appointment of appointments) {
      try {
        const schedule = await this.scheduleService.getScheduleById(appointment.scheduleId);
        if (schedule) {
          enrichedAppointments.push({
            ...appointment,
            schedule
          });
        } else {
          enrichedAppointments.push(appointment);
        }
      } catch (error) {
        // Si no se puede obtener el horario, devolver la cita sin enriquecer
        console.warn(`Could not enrich appointment ${appointment.id} with schedule:`, error);
        enrichedAppointments.push(appointment);
      }
    }

    return enrichedAppointments;
  }

  /**
   * Valida transiciones de estado válidas
   * @param currentStatus - Estado actual
   * @param newStatus - Nuevo estado
   */
  private validateStatusTransition(currentStatus: AppointmentStatus, newStatus: AppointmentStatus): void {
    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      [AppointmentStatus.PENDING]: [AppointmentStatus.PROCESSING, AppointmentStatus.FAILED],
      [AppointmentStatus.PROCESSING]: [AppointmentStatus.COMPLETED, AppointmentStatus.FAILED],
      [AppointmentStatus.COMPLETED]: [], // Estado final
      [AppointmentStatus.FAILED]: [] // Estado final
    };

    const allowedTransitions = validTransitions[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Transición de estado inválida: ${currentStatus} -> ${newStatus}`
      );
    }
  }
} 