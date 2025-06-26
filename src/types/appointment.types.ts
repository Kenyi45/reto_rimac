// Tipos base del dominio
export interface AppointmentRequest {
  insuredId: string;
  scheduleId: number;
  countryISO: CountryISO;
}

export interface Schedule {
  scheduleId: number;
  centerId: number;
  specialtyId: number;
  medicId: number;
  date: string; // ISO format
}

export interface Appointment {
  id: string;
  insuredId: string;
  scheduleId: number;
  countryISO: CountryISO;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
  schedule?: Schedule;
}

export interface AppointmentConfirmation {
  appointmentId: string;
  status: AppointmentStatus;
  countryISO: CountryISO;
  confirmedAt: string;
}

// Enums
export enum CountryISO {
  PE = 'PE',
  CL = 'CL'
}

export enum AppointmentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// Response types
export interface AppointmentResponse {
  success: boolean;
  message: string;
  data?: {
    appointmentId: string;
    status: AppointmentStatus;
  };
  error?: string;
}

export interface AppointmentListResponse {
  success: boolean;
  data: Appointment[];
  total: number;
}

// Event types
export interface AppointmentCreatedEvent {
  appointmentId: string;
  insuredId: string;
  scheduleId: number;
  countryISO: CountryISO;
  createdAt: string;
}

export interface AppointmentConfirmedEvent {
  appointmentId: string;
  countryISO: CountryISO;
  confirmedAt: string;
  status: AppointmentStatus;
}

// Database entity types
export interface AppointmentEntity {
  id: string;
  insuredId: string;
  scheduleId: number;
  countryISO: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentRDSEntity {
  id: string;
  insured_id: string;
  schedule_id: number;
  center_id: number;
  specialty_id: number;
  medic_id: number;
  appointment_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// Error types
export class AppointmentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppointmentError';
  }
}

export class ValidationError extends AppointmentError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppointmentError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppointmentError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

// Service interfaces (siguiendo principio de Inversión de Dependencias)
export interface IAppointmentRepository {
  create(appointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Appointment>;
  findById(id: string): Promise<Appointment | null>;
  findByInsuredId(insuredId: string): Promise<Appointment[]>;
  updateStatus(id: string, status: AppointmentStatus): Promise<void>;
  hasConflictingAppointment(scheduleId: number): Promise<boolean>;
}

export interface IAppointmentRDSRepository {
  create(appointment: Omit<AppointmentRDSEntity, 'id' | 'created_at' | 'updated_at'>): Promise<AppointmentRDSEntity>;
  findById(id: string): Promise<AppointmentRDSEntity | null>;
}

export interface INotificationService {
  publishAppointmentCreated(event: AppointmentCreatedEvent): Promise<void>;
  publishAppointmentConfirmed(event: AppointmentConfirmedEvent): Promise<void>;
  notifyError(error: Error, context?: Record<string, any>): Promise<void>;
}

export interface IScheduleService {
  getScheduleById(scheduleId: number): Promise<Schedule | null>;
  validateScheduleAvailability(scheduleId: number): Promise<boolean>;
}

export interface IValidationService {
  validateAppointmentRequest(request: unknown): AppointmentRequest;
  validateInsuredId(insuredId: string): boolean;
  validateCountryISO(countryISO: string): CountryISO;
} 