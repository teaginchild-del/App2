import { CheckCircle2, Package, Plus, Boxes } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { productColumns, type ProductRow } from '@/components/products/columns'
import { ProductFamilyDialog } from '@/components/products/ProductFamilyDialog'
import { DataTable } from '@/components/data-table/DataTable'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { listCatalogProducts, listProductFamilies } from '@/lib/api/catalog'
import type { Product, ProductFamily } from '@/types/billing'

export function Products() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [families, setFamilies] = useState<ProductFamily[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([listCatalogProducts(), listProductFamilies()])
      .then(([productList, familyList]) => {
        setProducts(productList)
        setFamilies(familyList)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load products.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const rows: ProductRow[] = useMemo(() => {
    const familyNames = new Map(families.map((f) => [f.id, f.name]))
    return products.map((product) => ({
      ...product,
      familyName: (product.productFamilyId && familyNames.get(product.productFamilyId)) || 'Uncategorized',
    }))
  }, [products, families])

  const stats = useMemo(() => {
    const active = products.filter((p) => p.isActive)
    return { total: products.length, active: active.length, families: families.length }
  }, [products, families])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Products"
        description="The catalog of products your customers can subscribe to."
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setFamilyDialogOpen(true)}>
              <Boxes className="h-4 w-4" />
              New Product Family
            </Button>
            <Button size="sm" onClick={() => navigate('/products/new')}>
              <Plus className="h-4 w-4" />
              New Product
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard label="Total Products" value={stats.total.toString()} icon={Package} />
        <StatCard label="Active Products" value={stats.active.toString()} icon={CheckCircle2} tone="success" />
        <StatCard label="Product Families" value={stats.families.toString()} icon={Boxes} />
      </div>

      <div className="min-h-0 flex-1 px-6 pb-6">
        <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-danger-600">{error}</div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading products...</div>
          ) : (
            <DataTable
              columns={productColumns}
              data={rows}
              searchPlaceholder="Search products by name, handle, or family..."
            />
          )}
        </div>
      </div>

      <ProductFamilyDialog
        open={familyDialogOpen}
        onClose={() => setFamilyDialogOpen(false)}
        onCreated={() => {
          setFamilyDialogOpen(false)
          load()
        }}
      />
    </div>
  )
}
