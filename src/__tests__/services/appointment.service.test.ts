import { AppointmentService } from '../../services/appointment.service';
import { ValidationService } from '../../services/validation.service';
import { NotificationService } from '../../services/notification.service';
import { AppointmentRepository } from '../../repositories/appointment.repository';
import {
  AppointmentStatus,
  CountryISO,
  AppointmentRequest,
  Appointment
} from '../../types/appointment.types';

// Mock de los servicios
jest.mock('../../repositories/appointment.repository');
jest.mock('../../services/notification.service');
jest.mock('../../services/validation.service');

describe('AppointmentService', () => {
  let appointmentService: AppointmentService;
  let mockAppointmentRepository: jest.Mocked<AppointmentRepository>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockValidationService: jest.Mocked<ValidationService>;

  beforeEach(() => {
    mockAppointmentRepository = new AppointmentRepository() as jest.Mocked<AppointmentRepository>;
    mockNotificationService = new NotificationService() as jest.Mocked<NotificationService>;
    mockValidationService = new ValidationService() as jest.Mocked<ValidationService>;
    
    appointmentService = new AppointmentService(
      mockAppointmentRepository, 
      mockNotificationService,
      mockValidationService
    );

    // Limpiar mocks
    jest.clearAllMocks();
  });

  describe('createAppointment', () => {
    const validRequest: AppointmentRequest = {
      insuredId: '12345',
      scheduleId: 100,
      countryISO: CountryISO.PE
    };

    it('should create appointment successfully', async () => {
      const expectedAppointment: Appointment = {
        id: 'test-uuid',
        insuredId: '12345',
        scheduleId: 100,
        countryISO: CountryISO.PE,
        status: AppointmentStatus.PENDING,
        createdAt: '2024-03-15T10:30:00.000Z',
        updatedAt: '2024-03-15T10:30:00.000Z'
      };

      mockValidationService.validateAppointmentRequest.mockReturnValue(validRequest);
      mockAppointmentRepository.create.mockResolvedValue(expectedAppointment);
      mockNotificationService.publishAppointmentCreated = jest.fn().mockResolvedValue(undefined);

      const result = await appointmentService.createAppointment(validRequest);

      // El servicio devuelve una respuesta estructurada
      expect(result).toEqual({
        success: true,
        message: 'El agendamiento está en proceso',
        data: {
          appointmentId: expectedAppointment.id,
          status: expectedAppointment.status
        }
      });
      expect(mockValidationService.validateAppointmentRequest).toHaveBeenCalledWith(validRequest);
      expect(mockAppointmentRepository.create).toHaveBeenCalledWith({
        ...validRequest,
        status: AppointmentStatus.PENDING
      });
    });

    it('should handle repository errors', async () => {
      const error = new Error('Database error');
      
      mockValidationService.validateAppointmentRequest.mockReturnValue(validRequest);
      mockAppointmentRepository.create.mockRejectedValue(error);

      const result = await appointmentService.createAppointment(validRequest);

      // El servicio maneja errores y devuelve respuesta estructurada
      expect(result).toEqual({
        success: false,
        message: 'Error interno del servidor',
        error: 'Ha ocurrido un error inesperado'
      });
      expect(mockAppointmentRepository.create).toHaveBeenCalledWith({
        ...validRequest,
        status: AppointmentStatus.PENDING
      });
    });

    it('should handle validation errors', async () => {
      const error = new Error('Validation error');
      
      mockValidationService.validateAppointmentRequest.mockImplementation(() => {
        throw error;
      });

      const result = await appointmentService.createAppointment(validRequest);

      // El servicio maneja errores de validación
      expect(result).toEqual({
        success: false,
        message: 'Error interno del servidor',
        error: 'Ha ocurrido un error inesperado'
      });
      expect(mockAppointmentRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getAppointmentsByInsuredId', () => {
    const insuredId = '12345';

    it('should return appointments for valid insured ID', async () => {
      const expectedAppointments: Appointment[] = [
        {
          id: 'test-uuid-1',
          insuredId,
          scheduleId: 100,
          countryISO: CountryISO.PE,
          status: AppointmentStatus.COMPLETED,
          createdAt: '2024-03-15T10:30:00.000Z',
          updatedAt: '2024-03-15T10:30:00.000Z'
        },
        {
          id: 'test-uuid-2',
          insuredId,
          scheduleId: 101,
          countryISO: CountryISO.PE,
          status: AppointmentStatus.PENDING,
          createdAt: '2024-03-15T10:30:00.000Z',
          updatedAt: '2024-03-15T10:30:00.000Z'
        }
      ];

      mockValidationService.validateInsuredId.mockReturnValue(true);
      mockAppointmentRepository.findByInsuredId.mockResolvedValue(expectedAppointments);

      const result = await appointmentService.getAppointmentsByInsuredId(insuredId);

      // El servicio devuelve respuesta estructurada
      expect(result).toEqual({
        success: true,
        data: expectedAppointments,
        total: expectedAppointments.length
      });
      expect(mockAppointmentRepository.findByInsuredId).toHaveBeenCalledWith(insuredId);
    });

    it('should return empty array when no appointments found', async () => {
      mockValidationService.validateInsuredId.mockReturnValue(true);
      mockAppointmentRepository.findByInsuredId.mockResolvedValue([]);

      const result = await appointmentService.getAppointmentsByInsuredId(insuredId);

      expect(result).toEqual({
        success: true,
        data: [],
        total: 0
      });
      expect(mockAppointmentRepository.findByInsuredId).toHaveBeenCalledWith(insuredId);
    });

    it('should handle invalid insured ID', async () => {
      mockValidationService.validateInsuredId.mockReturnValue(false);

      const result = await appointmentService.getAppointmentsByInsuredId('invalid');

      // El servicio maneja IDs inválidos y devuelve respuesta estructurada
      expect(result).toEqual({
        success: false,
        data: [],
        total: 0
      });
      expect(mockAppointmentRepository.findByInsuredId).not.toHaveBeenCalled();
    });
  });

  describe('updateAppointmentStatus', () => {
    const appointmentId = 'test-uuid';
    const newStatus = AppointmentStatus.PROCESSING; // Cambio a una transición válida

    it('should update appointment status successfully', async () => {
      const existingAppointment: Appointment = {
        id: appointmentId,
        insuredId: '12345',
        scheduleId: 100,
        countryISO: CountryISO.PE,
        status: AppointmentStatus.PENDING,
        createdAt: '2024-03-15T10:30:00.000Z',
        updatedAt: '2024-03-15T10:30:00.000Z'
      };

      mockAppointmentRepository.findById.mockResolvedValue(existingAppointment);
      mockAppointmentRepository.updateStatus.mockResolvedValue();

      await appointmentService.updateAppointmentStatus(appointmentId, newStatus);

      expect(mockAppointmentRepository.findById).toHaveBeenCalledWith(appointmentId);
      expect(mockAppointmentRepository.updateStatus).toHaveBeenCalledWith(appointmentId, newStatus);
    });

    it('should handle appointment not found', async () => {
      mockAppointmentRepository.findById.mockResolvedValue(null);

      await expect(appointmentService.updateAppointmentStatus(appointmentId, newStatus))
        .rejects.toThrow('Cita con ID test-uuid no encontrada');

      expect(mockAppointmentRepository.findById).toHaveBeenCalledWith(appointmentId);
      expect(mockAppointmentRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('getAppointmentById', () => {
    const appointmentId = 'test-uuid';

    it('should return appointment when found', async () => {
      const expectedAppointment: Appointment = {
        id: appointmentId,
        insuredId: '12345',
        scheduleId: 100,
        countryISO: CountryISO.PE,
        status: AppointmentStatus.PENDING,
        createdAt: '2024-03-15T10:30:00.000Z',
        updatedAt: '2024-03-15T10:30:00.000Z'
      };

      mockAppointmentRepository.findById.mockResolvedValue(expectedAppointment);

      const result = await appointmentService.getAppointmentById(appointmentId);

      expect(result).toEqual(expectedAppointment);
      expect(mockAppointmentRepository.findById).toHaveBeenCalledWith(appointmentId);
    });

    it('should throw error when appointment not found', async () => {
      mockAppointmentRepository.findById.mockResolvedValue(null);

      await expect(appointmentService.getAppointmentById(appointmentId))
        .rejects.toThrow('Cita con ID test-uuid no encontrada');

      expect(mockAppointmentRepository.findById).toHaveBeenCalledWith(appointmentId);
    });

    it('should handle repository errors', async () => {
      const error = new Error('Database error');
      mockAppointmentRepository.findById.mockRejectedValue(error);

      await expect(appointmentService.getAppointmentById(appointmentId))
        .rejects.toThrow('Database error');

      expect(mockAppointmentRepository.findById).toHaveBeenCalledWith(appointmentId);
    });
  });
}); 