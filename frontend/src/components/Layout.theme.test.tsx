import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Layout from './Layout'
import { ThemeProvider } from '../theme/ThemeContext'

function renderLayout(initialPath = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
})

afterEach(() => {
  cleanup()
})

describe('Layout theme toggle', () => {
  it('uses stored dark mode on startup', async () => {
    window.localStorage.setItem('blocky-ui-theme', 'dark')

    renderLayout()

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark')
    })
  })

  it('toggles dark mode and persists it to localStorage', async () => {
    renderLayout()

    const toggleButton = screen.getAllByRole('button', { name: 'Toggle color theme' })[0]

    fireEvent.click(toggleButton)

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark')
      expect(window.localStorage.getItem('blocky-ui-theme')).toBe('dark')
    })

    fireEvent.click(toggleButton)

    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass('dark')
      expect(window.localStorage.getItem('blocky-ui-theme')).toBe('light')
    })
  })
})
