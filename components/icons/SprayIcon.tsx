import React from 'react';

export const SprayIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} stroke="none" {...props}>
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="15.5" cy="10.5" r="1" />
    <circle cx="8.5" cy="10.5" r="1" />
    <circle cx="12" cy="8" r="1" />
    <circle cx="10" cy="14.5" r="1" />
    <circle cx="14" cy="14.5" r="1" />
    <circle cx="16.5" cy="13.5" r="0.75" />
    <circle cx="7.5" cy="13.5" r="0.75" />
    <circle cx="14" cy="17" r="0.5" />
    <circle cx="10" cy="17" r="0.5" />
  </svg>
);