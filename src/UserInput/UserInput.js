import React from 'react';

const userInput = (props) => {
  const inputStyle = {
    border: '2px solid red',
    padding: '16px',
    margin: '16px',
  };

  return <input
    type="text"
    style={inputStyle}
    onChange={props.changed}
    value={props.currentName} />;
};

export default userInput;