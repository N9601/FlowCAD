import { afterEach, describe, expect, it } from 'vitest'
import { formatArea, formatLength, formatVolume, getUnits, onUnitsChanged, setUnits } from '../src/units'

// Node has no localStorage, so this also checks that the units module loads and switches without it.
describe('units', () => {
  afterEach(() => setUnits('mm'))

  it('defaults to millimetres', () => {
    expect(getUnits()).toBe('mm')
    expect(formatLength(12.345)).toBe('12.35 mm')
    expect(formatArea(250)).toBe('2.50 cm2')
    expect(formatVolume(1500)).toBe('1.50 cm3')
  })

  it('converts to inches and notifies listeners', () => {
    let calls = 0
    const stop = onUnitsChanged(() => calls++)
    setUnits('in')
    setUnits('in')
    stop()
    expect(calls).toBe(1)
    expect(formatLength(25.4)).toBe('1.000 in')
    expect(formatArea(645.16)).toBe('1.000 in2')
    expect(formatVolume(16387.064)).toBe('1.000 in3')
  })
})
