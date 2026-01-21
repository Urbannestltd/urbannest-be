-- CreateTable
CREATE TABLE "property" (
    "propertyId" TEXT NOT NULL,
    "propertyName" TEXT,
    "propertyAddress" TEXT NOT NULL,
    "propertyCity" TEXT NOT NULL,
    "propertyState" TEXT NOT NULL,
    "propertyZip" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "propertyLandlordId" TEXT NOT NULL,
    "propertyCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "propertyUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_pkey" PRIMARY KEY ("propertyId")
);

-- CreateTable
CREATE TABLE "unit" (
    "unitId" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "unitBedrooms" INTEGER NOT NULL,
    "unitBathrooms" DOUBLE PRECISION NOT NULL,
    "unitSizeSqFt" DOUBLE PRECISION,
    "unitStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "unitPropertyId" TEXT NOT NULL,
    "unitCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("unitId")
);

-- CreateTable
CREATE TABLE "lease" (
    "leaseId" TEXT NOT NULL,
    "leaseStartDate" TIMESTAMP(3) NOT NULL,
    "leaseEndDate" TIMESTAMP(3) NOT NULL,
    "leaseRentAmount" DOUBLE PRECISION NOT NULL,
    "leaseStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "leaseDocumentUrl" TEXT,
    "leaseUnitId" TEXT NOT NULL,
    "leaseTenantId" TEXT NOT NULL,
    "leaseCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_pkey" PRIMARY KEY ("leaseId")
);

-- CreateTable
CREATE TABLE "payment" (
    "paymentId" TEXT NOT NULL,
    "paymentAmount" DOUBLE PRECISION NOT NULL,
    "paymentDueDate" TIMESTAMP(3) NOT NULL,
    "paymentPaidDate" TIMESTAMP(3),
    "paymentStatus" TEXT NOT NULL,
    "paymentReference" TEXT,
    "paymentLeaseId" TEXT NOT NULL,
    "paymentCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("paymentId")
);

-- AddForeignKey
ALTER TABLE "property" ADD CONSTRAINT "property_propertyLandlordId_fkey" FOREIGN KEY ("propertyLandlordId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_unitPropertyId_fkey" FOREIGN KEY ("unitPropertyId") REFERENCES "property"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease" ADD CONSTRAINT "lease_leaseUnitId_fkey" FOREIGN KEY ("leaseUnitId") REFERENCES "unit"("unitId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease" ADD CONSTRAINT "lease_leaseTenantId_fkey" FOREIGN KEY ("leaseTenantId") REFERENCES "user"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_paymentLeaseId_fkey" FOREIGN KEY ("paymentLeaseId") REFERENCES "lease"("leaseId") ON DELETE RESTRICT ON UPDATE CASCADE;
