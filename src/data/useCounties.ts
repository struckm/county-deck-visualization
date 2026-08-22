import {useEffect, useState} from 'react';
import type {CountyFeatureCollection} from '../map/types';

const COUNTIES_URL = '/data/us-counties-2023.geojson';

type CountyDataState =
  | {status: 'loading'}
  | {status: 'ready'; data: CountyFeatureCollection}
  | {status: 'error'; message: string};

export function useCounties(): CountyDataState {
  const [state, setState] = useState<CountyDataState>({status: 'loading'});

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(COUNTIES_URL, {signal: controller.signal});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as CountyFeatureCollection;
        setState({status: 'ready', data});
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return state;
}
