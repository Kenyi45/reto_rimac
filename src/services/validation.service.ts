import Joi from 'joi';
import { 
  AppointmentRequest, 
  CountryISO, 
  IValidationService, 
  ValidationError 
} from '../types/appointment.types';

/**
 * Servicio de validación siguiendo el principio de Responsabilidad Única (SRP)
 * Se encarga únicamente de la validación de datos de entrada
 */
export class ValidationService implements IValidationService {
  private readonly appointmentRequestSchema = Joi.object({
    insuredId: Joi.string()
      .pattern(/^\d{5}$/)
      .required()
      .messages({
        'string.pattern.base': 'insuredId debe ser un código de 5 dígitos',
        'any.required': 'insuredId es requerido'
      }),
    scheduleId: Joi.number()
      .integer()
      .positive()
      .required()
      .messages({
        'number.positive': 'scheduleId debe ser un número positivo',
        'any.required': 'scheduleId es requerido'
      }),
    countryISO: Joi.string()
      .valid('PE', 'CL')
      .required()
      .messages({
        'any.only': 'countryISO debe ser PE o CL',
        'any.required': 'countryISO es requerido'
      })
  });

  private readonly insuredIdSchema = Joi.string()
    .pattern(/^\d{5}$/)
    .required();

  /**
   * Valida una solicitud de cita médica
   * @param request - Datos de la solicitud a validar
   * @returns AppointmentRequest validado
   * @throws ValidationError si los datos no son válidos
   */
  validateAppointmentRequest(request: unknown): AppointmentRequest {
    const { error, value } = this.appointmentRequestSchema.validate(request, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message).join(', ');
      throw new ValidationError(`Datos de solicitud inválidos: ${errorMessages}`);
    }

    return value as AppointmentRequest;
  }

  /**
   * Valida el ID del asegurado
   * @param insuredId - ID a validar
   * @returns true si es válido
   */
  validateInsuredId(insuredId: string): boolean {
    const { error } = this.insuredIdSchema.validate(insuredId);
    return !error;
  }

  /**
   * Valida y convierte el código de país
   * @param countryISO - Código de país a validar
   * @returns CountryISO validado
   * @throws ValidationError si el código no es válido
   */
  validateCountryISO(countryISO: string): CountryISO {
    if (!Object.values(CountryISO).includes(countryISO as CountryISO)) {
      throw new ValidationError(`Código de país inválido: ${countryISO}. Debe ser PE o CL`);
    }
    return countryISO as CountryISO;
  }

  /**
   * Valida que el insuredId tenga el formato correcto con ceros a la izquierda si es necesario
   * @param insuredId - ID del asegurado
   * @returns ID formateado con ceros a la izquierda
   */
  formatInsuredId(insuredId: string): string {
    // Remover ceros a la izquierda y luego agregar los necesarios para tener 5 dígitos
    const cleanId = insuredId.replace(/^0+/, '') || '0';
    return cleanId.padStart(5, '0');
  }

  /**
   * Valida que el scheduleId existe y es válido
   * @param scheduleId - ID del horario
   * @returns true si es válido
   */
  validateScheduleId(scheduleId: number): boolean {
    return Number.isInteger(scheduleId) && scheduleId > 0;
  }

  /**
   * Valida parámetros de consulta GET
   * @param params - Parámetros a validar
   * @returns Parámetros validados
   */
  validateQueryParams(params: Record<string, unknown>): { insuredId: string } {
    const schema = Joi.object({
      insuredId: Joi.string()
        .pattern(/^\d{5}$/)
        .required()
        .messages({
          'string.pattern.base': 'insuredId debe ser un código de 5 dígitos',
          'any.required': 'insuredId es requerido en la URL'
        })
    });

    const { error, value } = schema.validate(params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message).join(', ');
      throw new ValidationError(`Parámetros de consulta inválidos: ${errorMessages}`);
    }

    return value as { insuredId: string };
  }
} 