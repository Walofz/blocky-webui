import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const AdsProfiles = lazy(() => import('./pages/AdsProfiles'))
const Groups = lazy(() => import('./pages/Groups'))
const CustomDNS = lazy(() => import('./pages/CustomDNS'))
const ListFiles = lazy(() => import('./pages/ListFiles'))
const Logs = lazy(() => import('./pages/Logs'))

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm text-slate-500">Loading page...</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="ads-profiles" element={<AdsProfiles />} />
            <Route path="groups" element={<Groups />} />
            <Route path="dns" element={<CustomDNS />} />
            <Route path="list-files" element={<ListFiles />} />
            <Route path="logs" element={<Logs />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
