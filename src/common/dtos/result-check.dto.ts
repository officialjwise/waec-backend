export class InitiateResultCheckDto {
  result_type: 'BECE' | 'WASSCE' | 'WASSCE-NOVDEC';
  index_number: string; // 10 digits
  year: number;
  phone: string;
  email: string;
  momo_number: string;
}
