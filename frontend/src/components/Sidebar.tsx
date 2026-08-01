import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  Globe,
  FileText,
  ScrollText,
  BarChart3,
  Box,
  Moon,
  Sun,
} from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/ads-profiles', label: 'Ads Profiles', icon: ShieldCheck },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/dns', label: 'Custom DNS', icon: Globe },
  { to: '/list-files', label: 'List Files', icon: FileText },
  { to: '/logs', label: 'Realtime Logs', icon: ScrollText },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

interface SidebarProps {
  isDarkMode: boolean
  toggleTheme: () => void
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isDarkMode, toggleTheme, isOpen, onClose }: SidebarProps) {
  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-40 w-56 min-h-screen bg-gray-900 text-gray-300 flex flex-col transform transition-transform duration-200',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        'md:static md:translate-x-0 md:z-auto'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-700">
        <Box className="text-primary-400" size={22} />
        <span className="font-bold text-white text-lg tracking-tight">Blocky UI</span>
        <button
          type="button"
          onClick={toggleTheme}
          className="ml-auto rounded-md border border-gray-700 bg-gray-800/80 p-2 text-gray-200 transition hover:bg-gray-700"
          aria-label="Toggle color theme"
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
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
