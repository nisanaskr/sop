import React from 'react';

// export default (props) => {
//   return (
//     <select>
//       {props.listitems.map(listitem => <option>{listitem}</option>)}
//     </select>
//   )
// }

export default ({listitems}) => {
  return (
    <select>
      {listitems.map(listitem => <option>{listitem}</option>)}
    </select>
  )
}