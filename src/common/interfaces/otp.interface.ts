export interface OtpRequest {
    id: string;
    phone: string;
    hubtel_request_id: string;
    hubtel_prefix: string;
    status: 'sent' | 'verified' | 'expired';
    created_at: string;
    expires_at: string;
  }