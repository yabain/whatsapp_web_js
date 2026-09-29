import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, Validate, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'ValidPhoneNumber', async: false })
export class ValidPhoneNumberConstraint implements ValidatorConstraintInterface {
  validate(phone: string): boolean {
    if (!phone || typeof phone !== 'string') return false;

    // Remove +, spaces, dashes, parentheses
    const normalized = phone.replace(/[+\s\-\(\)]/g, '');

    // Must be at least 6 digits
    if (normalized.length < 6) return false;

    // Must contain only digits
    if (!/^\d+$/.test(normalized)) return false;

    return true;
  }

  defaultMessage(): string {
    return 'Phone number must contain at least 6 digits (spaces, +, dashes, and parentheses are allowed)';
  }
}

export class SendWhatsappDto {
  @ApiProperty({
    description: 'Phone number with or without country code. Formatting characters (+, spaces, dashes) are automatically cleaned.',
    example: '+237690123456',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  @Validate(ValidPhoneNumberConstraint)
  phone: string;

  @ApiProperty({
    description: 'Text message content to send',
    example: 'Hello! Your order is ready.',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  message: string;
}

export class SendWhatsappMediaDto extends SendWhatsappDto {
  @ApiProperty({
    description: 'Base64-encoded media data',
    example: 'iVBORw0KGgoAAAANSUhEUgAAAAE...',
  })
  @IsString()
  @MinLength(1)
  data: string;

  @ApiProperty({
    description: 'MIME type of the media (e.g., image/png, application/pdf)',
    example: 'image/png',
  })
  @IsString()
  @MinLength(1)
  mimetype: string;

  @ApiPropertyOptional({
    description: 'Optional filename for the media',
    example: 'photo.png',
  })
  @IsOptional()
  @IsString()
  filename?: string;
}
