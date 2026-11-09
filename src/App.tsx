import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireAuth } from '@/components/auth/RouteGuards'
import { AppLayout } from '@/components/layout/AppLayout'
import { BankDepositDetail } from '@/pages/BankDepositDetail'
import { Banking } from '@/pages/Banking'
import { BillingRun } from '@/pages/BillingRun'
import { ContractDetail } from '@/pages/ContractDetail'
import { ContractNew } from '@/pages/ContractNew'
import { Contracts } from '@/pages/Contracts'
import { Customers } from '@/pages/Customers'
import { DepositDetail } from '@/pages/DepositDetail'
import { Home } from '@/pages/Home'
import { Integrations } from '@/pages/Integrations'
import { InvoiceDetail } from '@/pages/InvoiceDetail'
import { InvoiceNew } from '@/pages/InvoiceNew'
import { Invoices } from '@/pages/Invoices'
import { Login } from '@/pages/Login'
import { PaymentDetail } from '@/pages/PaymentDetail'
import { Payments } from '@/pages/Payments'
import { ProductNew } from '@/pages/ProductNew'
import { Products } from '@/pages/Products'
import { Receivables } from '@/pages/Receivables'
import { Revenue } from '@/pages/Revenue'
import { SalesOrderDetail } from '@/pages/SalesOrderDetail'
import { SalesOrderNew } from '@/pages/SalesOrderNew'
import { SalesOrders } from '@/pages/SalesOrders'
import { SubscriptionDetail } from '@/pages/SubscriptionDetail'
import { SubscriptionNew } from '@/pages/SubscriptionNew'
import { Subscriptions } from '@/pages/Subscriptions'
import { Users } from '@/pages/Users'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Every app route requires a signed-in, approved user. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:customerId" element={<Customers />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/new" element={<ProductNew />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/subscriptions/new" element={<SubscriptionNew />} />
          <Route path="/subscriptions/:subscriptionId" element={<SubscriptionDetail />} />
          <Route path="/sales-orders" element={<SalesOrders />} />
          <Route path="/sales-orders/new" element={<SalesOrderNew />} />
          <Route path="/sales-orders/:salesOrderId" element={<SalesOrderDetail />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/contracts/new" element={<ContractNew />} />
          <Route path="/contracts/:contractId" element={<ContractDetail />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/new" element={<InvoiceNew />} />
          <Route path="/invoices/:invoiceId" element={<InvoiceDetail />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payments/:paymentId" element={<PaymentDetail />} />
          <Route path="/payments/deposits/:depositId" element={<DepositDetail />} />
          <Route path="/billing-run" element={<BillingRun />} />
          <Route path="/receivables" element={<Receivables />} />
          <Route path="/banking" element={<Banking />} />
          <Route path="/banking/deposits/:bankDepositId" element={<BankDepositDetail />} />
          <Route path="/revenue" element={<Revenue />} />
          <Route path="/configure/integrations" element={<Integrations />} />
          <Route element={<RequireAdmin />}>
            <Route path="/configure/users" element={<Users />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
