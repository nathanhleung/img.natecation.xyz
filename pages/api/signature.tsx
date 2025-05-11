import { Resvg } from '@resvg/resvg-js';
import axios from 'axios';
import { isAfter } from 'date-fns';
import { last, partition } from 'lodash';
import mime from 'mime-types';
import type { NextApiRequest, NextApiResponse } from 'next';
import React from 'react';
import satori from 'satori';

import fontBoldData from '../../assets/font-bold.json';
import fontNormalData from '../../assets/font-normal.json';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DEFAULT_TRIP = {
  startDate: new Date("6/18/2023"),
  city: "Los Angeles, CA"
};

async function getTrips() {
  const res = await axios.get("https://natecation.com/site-metadata.json");
  return res.data.trips;
}

async function getLatLng(location: string) {
  const apiUrl = `https://maps.googleapis.com/maps/api/geocode/json?&address=${encodeURIComponent(location)}&key=${GOOGLE_MAPS_API_KEY}`
  const res = await axios.get(apiUrl);
  return res.data.results[0].geometry.location;
}

async function getUtcOffset(lat: number, lng: number) {
  const apiUrl = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${Math.floor(Date.now() / 1000)}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await axios.get(apiUrl);
  return Math.round((res.data.rawOffset + res.data.dstOffset) / 3600 * 100) / 100;
}

type BoxProps = JSX.IntrinsicElements['div'];
const Box: React.FC<BoxProps> = ({ style, ...restProps }) => {
  return <div style={{
    display: 'flex',
    ...style,
  }} {...restProps} />
}

type TextProps = JSX.IntrinsicElements['p'];
const Text: React.FC<TextProps> = ({ style, ...restProps }) => {
  return <p style={{
    margin: 0,
    ...style
  }} {...restProps} />
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  let trips = [DEFAULT_TRIP];
  try {
    trips = await getTrips();
  } catch { }

  const currentDate = new Date();
  const [_, pastTrips] = partition(trips, trip => isAfter(new Date(trip.startDate), currentDate));
  const mostRecentPastTrip = last(pastTrips) ?? DEFAULT_TRIP;

  let utcOffset = null;
  if (req.query.timezone === "true") {
    try {
      const { lat, lng } = await getLatLng(mostRecentPastTrip.city);
      utcOffset = await getUtcOffset(lat, lng)
    } catch (e) {
      console.log(e);
    }
  }
  const utcOffsetString = utcOffset != null ? ` (UTC${utcOffset > 0 ? '+' : ''}${utcOffset})` : '';

  const height = !isNaN(Number(req.query.height)) ? Math.round(Number(req.query.height)) : 80;
  const scale = height / 80;
  const width = Math.round(scale * 550);

  const svg = await satori(
    <Box
      style={{
        width: '100%',
        height: '100%',
        alignItems: 'flex-start',
        justifyContent: 'center',
        flexDirection: 'column',
        fontFamily: 'Default',
        fontSize: `${Math.round(scale * 24)}px`,
        background: req.query.background ? req.query.background.toString() : 'white',
      }}
    >
      <Text style={{ fontWeight: 700 }}>Nathan H. Leung</Text>
      <Box style={{ alignItems: 'center' }}>
        <Text>
          {mostRecentPastTrip.city.replace(/[^A-Za-z'_\-, ]/g, '')}{utcOffsetString} &middot;
        </Text>
        <Text style={{
          marginTop: `${Math.round(scale * 4)}px`,
          marginLeft: `${Math.round(scale * 6)}px`,
          color: 'rgb(32, 150, 255)',
          borderBottomColor: 'rgba(32, 150, 255, 0.2)',
          borderBottomWidth: `${Math.round(scale * 5)}px`,
          borderBottomStyle: 'solid',
          lineHeight: `${Math.round(scale * 28)}px`,
        }}>
          natecation.com
        </Text>
      </Box>
    </Box>,
    {
      width,
      height,
      fonts: [
        { name: 'Default', data: Buffer.from(fontNormalData.map(i => Math.round((i - 1) / 2))), weight: 400 },
        {
          name: 'Default', data: Buffer.from(fontBoldData.map(i => Math.round((i - 1) / 2))), weight: 700
        }
      ],

    }
  );

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'original'
    },
  })

  const secondsPerDay = 24 * 60 * 60;
  res.status(200)
    .setHeader("content-type", mime.lookup('.png') || "")
    .setHeader('cache-control', `public, no-transform, max-age=${secondsPerDay}`)
    .end(resvg.render().asPng());
}
