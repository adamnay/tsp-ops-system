'use client'
import { Toaster as HotToaster } from 'react-hot-toast'

export function Toaster() {
  return (
    <HotToaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#1A1D27',
          border: '1px solid #2A2D3E',
          color: '#F0F2F8',
          fontSize: '14px',
        },
        success: {
          iconTheme: { primary: '#00D084', secondary: '#1A1D27' },
        },
        error: {
          iconTheme: { primary: '#FF4D6A', secondary: '#1A1D27' },
        },
      }}
    />
  )
}
