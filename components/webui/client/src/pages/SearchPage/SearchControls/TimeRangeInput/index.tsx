import {
    DatePicker,
    Select,
} from "antd";
import dayjs from "dayjs";
import {SwapRightOutlined} from "@ant-design/icons";

import useSearchStore from "../../SearchState/index";
import {SEARCH_UI_STATE} from "../../SearchState/typings";
import styles from "./index.module.css";
import {
    convertDateTimeInputValueToDayjs,
    isValidDateRange,
    TIME_RANGE_OPTION,
    TIME_RANGE_OPTION_DAYJS_MAP,
    TIME_RANGE_OPTION_NAMES,
} from "./utils";
import { useCallback, useEffect, useRef } from "react";

/**
 * Renders controls for selecting a time range for queries. By default, the component is
 * a select dropdown with a list of preset time ranges. If the user selects "Custom",
 * a date range picker is also displayed.
 *
 * @return
 */
const TimeRangeInput = () => {
    const {
        timeRange,
        updateTimeRange,
        timeRangeOption,
        updateTimeRangeOption,
        searchUiState,
    } = useSearchStore();

    const handleSelectChange = (newTimeRangeOption: TIME_RANGE_OPTION) => {
        updateTimeRangeOption(newTimeRangeOption);
        if (newTimeRangeOption !== TIME_RANGE_OPTION.CUSTOM) {
            const dayJsRange = TIME_RANGE_OPTION_DAYJS_MAP[newTimeRangeOption]();
            updateTimeRange(dayJsRange);
        }
    };

    const handleStartTimeChange = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = convertDateTimeInputValueToDayjs(ev.target.value);
        const newTimeRange : [dayjs.Dayjs, dayjs.Dayjs] = [newTime, timeRange[1]];

        const {updateTimeRange} = useSearchStore.getState();
        updateTimeRange(newTimeRange);
    }, [timeRange]);

    const handleEndTimeChange = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = convertDateTimeInputValueToDayjs(ev.target.value);
        const newTimeRange : [dayjs.Dayjs, dayjs.Dayjs] = [timeRange[0], newTime];

        const {updateTimeRange} = useSearchStore.getState();
        updateTimeRange(newTimeRange);
    }, [timeRange]);

    const isRangePickerDisabled = searchUiState === SEARCH_UI_STATE.QUERY_ID_PENDING || searchUiState === SEARCH_UI_STATE.QUERYING;

    useEffect(() => {

    }, [timeRange]);
    const startTimeRef
    const startTime = timeRange[0].format("YYYY-MM-DDTHH:mm:ss.SSS");
    const endTime = timeRange[1].format("YYYY-MM-DDTHH:mm:ss.SSS");

    return (
        <div
            className={styles["timeRangeInputContainer"]}
        >
            <Select
                listHeight={400}
                options={TIME_RANGE_OPTION_NAMES.map((option) => ({label: option, value: option}))}
                popupMatchSelectWidth={false}
                size={"large"}
                value={timeRangeOption}
                variant={"filled"}
                className={timeRangeOption === TIME_RANGE_OPTION.CUSTOM ?
                    (styles["customSelected"] || "") :
                    ""}
                disabled={searchUiState === SEARCH_UI_STATE.QUERY_ID_PENDING ||
                            searchUiState === SEARCH_UI_STATE.QUERYING}
                onChange={handleSelectChange}/>
            {timeRangeOption === TIME_RANGE_OPTION.CUSTOM && (
                <div style={{display: "flex"}} className="ant-input-outlined ant-input-css-var css-var-r0">
                  <input
                      style={{border:"none", outline:"none"}}
                    type="datetime-local"
                    defaultValue={startTime}
                    step={"0.1"}
                    onChange={handleStartTimeChange}
                    disabled={isRangePickerDisabled}
                  />
                  <SwapRightOutlined style={{marginLeft: 10, marginRight: 10}}/>
                  <input
                      style={{border:"none"}}
                    type="datetime-local"
                    defaultValue={endTime}
                    step={"0.1"}
                    onChange={handleEndTimeChange}
                    disabled={isRangePickerDisabled}
                  />
                </div>
            )}
        </div>
    );
};


export default TimeRangeInput;
