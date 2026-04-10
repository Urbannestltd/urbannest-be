import { PaymentType } from "@prisma/client";

export interface AdminPaymentListItemDto {
  id: string;
  reference: string;
  amount: number;
  status: string;
  type: string;
  dueDate: Date | null;
  paidDate: Date | null;
  createdAt: Date;
  tenant: {
    id: string;
    name: string;
    email: string;
  } | null;
  property: {
    id: string;
    name: string | null;
  } | null;
  unit: {
    id: string;
    name: string;
  } | null;
}

export interface AdminGetPaymentsQuery {
  propertyId?: string;
  tenantId?: string;
  startDate?: string;
  endDate?: string;
  type?: PaymentType;
}
