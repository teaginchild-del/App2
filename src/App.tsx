import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Customers } from '@/pages/Customers'
import { Home } from '@/pages/Home'
import { Integrations } from '@/pages/Integrations'
import { ProductNew } from '@/pages/ProductNew'
import { Products } from '@/pages/Products'
import { SubscriptionDetail } from '@/pages/SubscriptionDetail'
import { SubscriptionNew } from '@/pages/SubscriptionNew'
import { Subscriptions } from '@/pages/Subscriptions'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:customerId" element={<Customers />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/new" element={<ProductNew />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/subscriptions/new" element={<SubscriptionNew />} />
        <Route path="/subscriptions/:subscriptionId" element={<SubscriptionDetail />} />
        <Route path="/configure/integrations" element={<Integrations />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
