import { IsOptional, IsString, MinLength } from 'class-validator';

export class SendWhatsappDto {
  @IsString()
  @MinLength(6)
  phone: string;

  @IsString()
  @MinLength(1)
  message: string;
}

export class SendWhatsappMediaDto extends SendWhatsappDto {
  @IsString()
  @MinLength(1)
  data: string;

  @IsString()
  @MinLength(1)
  mimetype: string;

  @IsOptional()
  @IsString()
  filename?: string;
}
