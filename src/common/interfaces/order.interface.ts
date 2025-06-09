export interface Order {
    id: string;
    waec_type: 'BECE' | 'WASSCE' | 'NOVDEC';
    quantity: number;
    phone: string;
    email?: string;
    paystack_ref?: string;
    status: 'pending' | 'paid' | 'failed';
    created_at: string;
  }