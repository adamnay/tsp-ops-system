/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/deals/[id]/summary-pdf': ['./node_modules/pdfkit/js/data/**/*'],
      '/api/integrations/gdrive/sync-deal': ['./node_modules/pdfkit/js/data/**/*'],
      '/api/integrations/gdrive/sync-deal-pdf': ['./node_modules/pdfkit/js/data/**/*'],
    },
  },
}

export default nextConfig
