import { Dayjs } from "dayjs";

type DateRangeValueType = [Dayjs, Dayjs];

interface RangePickerProps {
    value: DateRangeValueType
    onChange: (newValue: DateRangeValueType) => void
}

const DateRangePicker = ({value, onChange}: RangePickerProps) => {



    
    return (
        <div style={{display: "flex"}} className="ant-input-outlined ant-input-css-var css-var-r0">
          <Input
              style={{border:"none", outline:"none"}}
            type="datetime-local"
            defaultValue={startTime}
            step={"0.1"}
            onChange={handleStartTimeChange}
            disabled={isRangePickerDisabled}
          />
          <SwapRightOutlined style={{marginLeft: 10, marginRight: 10}}/>
          <Input
              style={{border:"none"}}
            type="datetime-local"
            defaultValue={endTime}
            step={"0.1"}
            onChange={handleEndTimeChange}
            disabled={isRangePickerDisabled}
          />
        </div>
    );
};


export default RangePicker;
