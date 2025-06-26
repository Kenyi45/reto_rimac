import { ValidationService } from '../../services/validation.service';
import { CountryISO } from '../../types/appointment.types';

describe('ValidationService', () => {
  let validationService: ValidationService;

  beforeEach(() => {
    validationService = new ValidationService();
  });

  describe('validateAppointmentRequest', () => {
    it('should validate a correct appointment request', () => {
      const validRequest = {
        insuredId: '12345',
        scheduleId: 100,
        countryISO: CountryISO.PE
      };

      const result = validationService.validateAppointmentRequest(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate appointment request with CL country', () => {
      const validRequest = {
        insuredId: '12345',
        scheduleId: 100,
        countryISO: CountryISO.CL
      };

      const result = validationService.validateAppointmentRequest(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate formatted insuredId', () => {
      const request = {
        insuredId: '00123', // Ya formateado
        scheduleId: 100,
        countryISO: CountryISO.PE
      };

      const result = validationService.validateAppointmentRequest(request);
      expect(result.insuredId).toBe('00123');
    });

    it('should throw error for invalid insuredId format', () => {
      const invalidRequest = {
        insuredId: 'abc12', // Invalid format
        scheduleId: 100,
        countryISO: CountryISO.PE
      };

      expect(() => {
        validationService.validateAppointmentRequest(invalidRequest);
      }).toThrow();
    });

    it('should throw error for invalid scheduleId', () => {
      const invalidRequest = {
        insuredId: '12345',
        scheduleId: 0, // Invalid
        countryISO: CountryISO.PE
      };

      expect(() => {
        validationService.validateAppointmentRequest(invalidRequest);
      }).toThrow();
    });

    it('should throw error for missing required fields', () => {
      const invalidRequest = {
        insuredId: '12345'
        // Missing scheduleId and countryISO
      };

      expect(() => {
        validationService.validateAppointmentRequest(invalidRequest as any);
      }).toThrow();
    });
  });

  describe('validateInsuredId', () => {
    it('should return true for valid insuredId format', () => {
      const validIds = ['12345', '00123', '99999'];
      
      validIds.forEach(id => {
        const result = validationService.validateInsuredId(id);
        expect(result).toBe(true);
      });
    });

    it('should return false for invalid insuredId formats', () => {
      const invalidIds = ['123', '123456', 'abcde', '1234a', ''];
      
      invalidIds.forEach(id => {
        const result = validationService.validateInsuredId(id);
        expect(result).toBe(false);
      });
    });
  });

  describe('validateCountryISO', () => {
    it('should return CountryISO for valid countries', () => {
      expect(validationService.validateCountryISO('PE')).toBe(CountryISO.PE);
      expect(validationService.validateCountryISO('CL')).toBe(CountryISO.CL);
    });

    it('should throw error for invalid countries', () => {
      const invalidCountries = ['XX', 'US', 'BR', '', 'pe', 'cl'];
      
      invalidCountries.forEach(country => {
        expect(() => {
          validationService.validateCountryISO(country);
        }).toThrow();
      });
    });
  });

  describe('formatInsuredId', () => {
    it('should format insured ID with leading zeros', () => {
      expect(validationService.formatInsuredId('123')).toBe('00123');
      expect(validationService.formatInsuredId('1')).toBe('00001');
      expect(validationService.formatInsuredId('12345')).toBe('12345');
    });

    it('should handle edge cases', () => {
      expect(validationService.formatInsuredId('0')).toBe('00000');
      expect(validationService.formatInsuredId('00000')).toBe('00000');
    });
  });

  describe('validateScheduleId', () => {
    it('should return true for valid schedule IDs', () => {
      expect(validationService.validateScheduleId(1)).toBe(true);
      expect(validationService.validateScheduleId(100)).toBe(true);
      expect(validationService.validateScheduleId(9999)).toBe(true);
    });

    it('should return false for invalid schedule IDs', () => {
      expect(validationService.validateScheduleId(0)).toBe(false);
      expect(validationService.validateScheduleId(-1)).toBe(false);
    });
  });
}); 