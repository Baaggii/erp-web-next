// src/client/components/Layout.jsx
import React from 'react'
import { Mosaic, MosaicWindow } from 'react-mosaic-component'
import 'react-mosaic-component/react-mosaic-component.css'
import SalesDashboard from '../windows/SalesDashboard'
import GLInquiry from '../windows/GLInquiry'
import PurchaseOrder from '../windows/PurchaseOrder'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, company, year, season } = useAuth()

  // initial layout: two panels split vertically
  const initialLayout = {
    direction: 'row',
    first: 'sales',
    second: 'gl',
  }

  const renderTile = (id) => {
    switch (id) {
      case 'sales': return <SalesDashboard />
      case 'gl':    return <GLInquiry />
      case 'po':    return <PurchaseOrder />
      default:      return <div>Unknown</div>
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* — Header Bar — */}
      <header style={{
        background: '#1e1e2f',
        color: 'white',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 50
      }}>
        <div>
          <strong>{company}</strong> | Year: {year} | Season: {season}
        </div>
        <nav>
          {/* your nav links, settings, logout, KPI icons… */}
          <a href="/erp/settings" style={{ color: 'white', margin: '0 8px' }}>Settings</a>
          <span style={{ margin: '0 8px' }}>🔔3</span>
          <span style={{ margin: '0 8px' }}>Hi, {user.name}</span>
        </nav>
      </header>

      {/* — Floating Window Manager — */}
      <div style={{ flex: 1 }}>
        <Mosaic
          renderTile={(id, path) => (
            <MosaicWindow path={path} title={id.toUpperCase()}>
              {renderTile(id)}
            </MosaicWindow>
          )}
          initialValue={initialLayout}
        />
      </div>
    </div>
  )
}
