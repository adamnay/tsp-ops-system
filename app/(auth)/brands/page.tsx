import { createClient } from '@/lib/supabase/server'
import { BrandsClient } from './BrandsClient'

export default async function BrandsPage() {
  const supabase = createClient()
  const { data: brands } = await supabase.from('brands').select('*').order('brand_name')
  return <BrandsClient initialBrands={brands ?? []} />
}
