import { IsString, MinLength } from 'class-validator';

export class SendWhatsappDto {
  @IsString()
  @MinLength(6)
  phone: string;

  @IsString()
  @MinLength(1)
  message: string;
}
