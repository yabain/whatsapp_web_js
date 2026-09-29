import { validate } from 'class-validator';
import { SendWhatsappDto, SendWhatsappMediaDto } from './send-whatsapp.dto';

describe('SendWhatsappDto', () => {
  it('should pass validation for a valid phone and message', async () => {
    const dto = new SendWhatsappDto();
    dto.phone = '+237690123456';
    dto.message = 'Hello world';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation for a local phone number', async () => {
    const dto = new SendWhatsappDto();
    dto.phone = '690123456';
    dto.message = 'Test';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation for empty phone', async () => {
    const dto = new SendWhatsappDto();
    dto.phone = '';
    dto.message = 'Hello';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail validation for phone with less than 6 characters', async () => {
    const dto = new SendWhatsappDto();
    dto.phone = '12345';
    dto.message = 'Hello';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail validation for empty message', async () => {
    const dto = new SendWhatsappDto();
    dto.phone = '+237690123456';
    dto.message = '';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass validation for phone with spaces and +', async () => {
    const dto = new SendWhatsappDto();
    dto.phone = '+237 690 123 456';
    dto.message = 'Hello';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation for phone with dashes', async () => {
    const dto = new SendWhatsappDto();
    dto.phone = '237-690-123-456';
    dto.message = 'Hello';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe('SendWhatsappMediaDto', () => {
  it('should pass validation with all required fields', async () => {
    const dto = new SendWhatsappMediaDto();
    dto.phone = '+237690123456';
    dto.message = 'Check this';
    dto.data = 'base64encodeddata';
    dto.mimetype = 'image/png';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation with optional filename', async () => {
    const dto = new SendWhatsappMediaDto();
    dto.phone = '+237690123456';
    dto.message = 'Check this';
    dto.data = 'base64data';
    dto.mimetype = 'image/jpeg';
    dto.filename = 'photo.jpg';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when data is empty', async () => {
    const dto = new SendWhatsappMediaDto();
    dto.phone = '+237690123456';
    dto.message = 'Check this';
    dto.data = '';
    dto.mimetype = 'image/png';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail validation when mimetype is empty', async () => {
    const dto = new SendWhatsappMediaDto();
    dto.phone = '+237690123456';
    dto.message = 'Check this';
    dto.data = 'base64data';
    dto.mimetype = '';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});