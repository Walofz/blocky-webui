import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  Globe,
  ScrollText,
  Box,
} from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/ads-profiles', label: 'Ads Profiles', icon: ShieldCheck },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/dns', label: 'Custom DNS', icon: Globe },
  { to: '/logs', label: 'Realtime Logs', icon: ScrollText },
]

export default function Sidebar() {
  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-gray-300 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-700">
        <Box className="text-primary-400" size={22} />
        <span className="font-bold text-white text-lg tracking-tight">Blocky UI</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-700 text-white'
                  : 'hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-700">
        Blocky WebUI v1.0
      </div>
    </aside>
  )
}
