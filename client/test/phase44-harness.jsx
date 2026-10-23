import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import WeekdayPicker from '../src/components/ui/WeekdayPicker.jsx';
export default function Harness() {
    const [value,setValue]=useState(null);
    return <><WeekdayPicker value={value} takenBy={{1:'Torso'}} onChange={setValue}/><output>{value===null?'Sin asignar':value}</output></>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
