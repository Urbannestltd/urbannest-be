import { ExpenseCategory } from "@prisma/client";

export interface CreateExpenseDto {
  amount: number;
  category: ExpenseCategory;
  description: string;
  date?: string;
  propertyId?: string;
  unitId?: string;
}

export interface ExpenseResponseDto {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: Date;
  createdAt: Date;
  propertyId: string | null;
  unitId: string | null;
}
