import { describe, expect, it } from 'vitest';

import { parseLdx } from '@core/ld/ldx';

const SAMPLE = `<?xml version="1.0"?>
<LDXFile Locale="Russian_Russia.1251" Version="1.6">
 <Layers>
  <Layer>
   <MarkerBlock>
    <MarkerGroup Name="Beacons" Index="15">
     <Marker Version="100" ClassName="BCN" Name="Manual.1" Flags="77" Time="1.27033000000000000e+08"/>
     <Marker Version="100" ClassName="BCN" Name="Manual.2" Flags="77" Time="2.48988000000000000e+08"/>
    </MarkerGroup>
   </MarkerBlock>
  </Layer>
  <Details>
   <Numeric Id="Vehicle Wheelbase" Value="2.715" Unit="m" DPS="3"/>
   <Numeric Id="Vehicle Track" Value="1.693" Unit="m" DPS="3"/>
   <Numeric Id="Venue Length" Value="5755.02" Unit="m" DPS="6"/>
   <Numeric Id="Fuel Tank Capacity" Value="100" Unit="l" DPS="2"/>
   <Numeric Id="Vehicle Weight" Value="1255" Unit="kg" DPS="2"/>
   <String Id="AppName" Value="Telemetrick v1.72"/>
  </Details>
 </Layers>
</LDXFile>`;

describe('parseLdx', () => {
  it('reads beacon times in seconds', () => {
    const data = parseLdx(SAMPLE);
    expect(data.beaconTimes).toHaveLength(2);
    expect(data.beaconTimes[0]).toBeCloseTo(127.033, 3);
    expect(data.beaconTimes[1]).toBeCloseTo(248.988, 3);
  });

  it('reads the venue length and vehicle details', () => {
    const data = parseLdx(SAMPLE);
    expect(data.trackLength).toBeCloseTo(5755.02, 2);
    expect(data.vehicle.wheelbase).toBeCloseTo(2.715, 3);
    expect(data.vehicle.track).toBeCloseTo(1.693, 3);
    expect(data.vehicle.weight).toBeCloseTo(1255, 0);
    expect(data.vehicle.fuelCapacity).toBeCloseTo(100, 0);
    expect(data.appName).toBe('Telemetrick v1.72');
  });

  it('returns empty data for an .ldx without markers or details', () => {
    const data = parseLdx('<?xml version="1.0"?><LDXFile Version="1.6"></LDXFile>');
    expect(data.beaconTimes).toEqual([]);
    expect(data.trackLength).toBeUndefined();
    expect(data.vehicle).toEqual({});
  });

  it('ignores markers that are not beacons', () => {
    const xml = '<LDXFile><Marker ClassName="RNG" Name="Range.1" Time="1.0e+08"/></LDXFile>';
    expect(parseLdx(xml).beaconTimes).toEqual([]);
  });
});
