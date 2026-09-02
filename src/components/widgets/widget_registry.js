import { NexusTimerWidget } from './timer_widget.js';
import { NexusPomodoroWidget } from './pomodoro_widget.js';
import { NexusStopwatchWidget } from './stopwatch_widget.js';
import { NexusUnitConverterWidget } from './unit_converter_widget.js';
import { NexusWorldClockWidget } from './world_clock_widget.js';
import { NexusDateDiffWidget } from './date_diff_widget.js';
import { NexusQrGeneratorWidget } from './qr_generator_widget.js';
import { NexusCurrencyWidget } from './currency_widget.js';
import { NexusCryptoWidget } from './crypto_widget.js';
import { NexusLoanCalcWidget } from './loan_calc_widget.js';
import { CompoundInterestWidget } from './compound_interest_widget.js';
import { TipSplitterWidget } from './tip_splitter_widget.js';
import { GoldPriceWidget } from './gold_price_widget.js';
import { WeatherWidget } from './weather_widget.js';
import { WeatherForecastWidget } from './weather_forecast_widget.js';
import { AirQualityWidget } from './air_quality_widget.js';
import { SunUvWidget } from './sun_uv_widget.js';
import { BmiTdeeWidget } from './bmi_tdee_widget.js';
import { FunctionPlotterWidget } from './function_plotter_widget.js';
import { PeriodicTableWidget } from './periodic_table_widget.js';

class NexusWidgetRegistry {
    constructor() {
        this.factories = new Map();
        this.registerBuiltins();
    }

    registerBuiltins() {
        // Phase 1 Essential Daily Utilities
        this.register('timer', (container, props) => new NexusTimerWidget(container, props));
        this.register('pomodoro', (container, props) => new NexusPomodoroWidget(container, props));
        this.register('stopwatch', (container, props) => new NexusStopwatchWidget(container, props));
        this.register('unit_converter', (container, props) => new NexusUnitConverterWidget(container, props));
        this.register('world_clock', (container, props) => new NexusWorldClockWidget(container, props));
        this.register('date_diff', (container, props) => new NexusDateDiffWidget(container, props));
        this.register('qr_generator', (container, props) => new NexusQrGeneratorWidget(container, props));

        // Phase 2 Finance & Realtime Markets
        this.register('currency', (container, props) => new NexusCurrencyWidget(container, props));
        this.register('crypto', (container, props) => new NexusCryptoWidget(container, props));
        this.register('loan_calc', (container, props) => new NexusLoanCalcWidget(container, props));
        this.register('compound_interest', (container, props) => new CompoundInterestWidget(container, props));
        this.register('tip_splitter', (container, props) => new TipSplitterWidget(container, props));
        this.register('gold_price', (container, props) => new GoldPriceWidget(container, props));

        // Phase 3 Weather, Environment & Health
        this.register('weather', (container, props) => new WeatherWidget(container, props));
        this.register('weather_forecast', (container, props) => new WeatherForecastWidget(container, props));
        this.register('air_quality', (container, props) => new AirQualityWidget(container, props));
        this.register('sun_uv', (container, props) => new SunUvWidget(container, props));
        this.register('bmi_tdee', (container, props) => new BmiTdeeWidget(container, props));

        // Phase 5 Education, Science & Visuals
        this.register('function_plotter', (container, props) => new FunctionPlotterWidget(container, props));
        this.register('periodic_table', (container, props) => new PeriodicTableWidget(container, props));

        // Helpful alias keys
        this.register('converter', (container, props) => new NexusUnitConverterWidget(container, props));
        this.register('clock', (container, props) => new NexusWorldClockWidget(container, props));
        this.register('timezone', (container, props) => new NexusWorldClockWidget(container, props));
        this.register('countdown', (container, props) => new NexusDateDiffWidget(container, props));
        this.register('qr_code', (container, props) => new NexusQrGeneratorWidget(container, props));
        this.register('qrcode', (container, props) => new NexusQrGeneratorWidget(container, props));
        this.register('exchange_rate', (container, props) => new NexusCurrencyWidget(container, props));
        this.register('forex', (container, props) => new NexusCurrencyWidget(container, props));
        this.register('coin', (container, props) => new NexusCryptoWidget(container, props));
        this.register('mortgage', (container, props) => new NexusLoanCalcWidget(container, props));
        this.register('loan', (container, props) => new NexusLoanCalcWidget(container, props));
        this.register('savings', (container, props) => new CompoundInterestWidget(container, props));
        this.register('interest', (container, props) => new CompoundInterestWidget(container, props));
        this.register('tip', (container, props) => new TipSplitterWidget(container, props));
        this.register('bill', (container, props) => new TipSplitterWidget(container, props));
        this.register('gold', (container, props) => new GoldPriceWidget(container, props));
        this.register('xau', (container, props) => new GoldPriceWidget(container, props));
        this.register('gia_vang', (container, props) => new GoldPriceWidget(container, props));
        this.register('forecast', (container, props) => new WeatherForecastWidget(container, props));
        this.register('aqi', (container, props) => new AirQualityWidget(container, props));
        this.register('air', (container, props) => new AirQualityWidget(container, props));
        this.register('uv', (container, props) => new SunUvWidget(container, props));
        this.register('sunrise', (container, props) => new SunUvWidget(container, props));
        this.register('sunset', (container, props) => new SunUvWidget(container, props));
        this.register('bmi', (container, props) => new BmiTdeeWidget(container, props));
        this.register('tdee', (container, props) => new BmiTdeeWidget(container, props));
        this.register('calories', (container, props) => new BmiTdeeWidget(container, props));
        this.register('plotter', (container, props) => new FunctionPlotterWidget(container, props));
        this.register('graph', (container, props) => new FunctionPlotterWidget(container, props));
        this.register('graph_plotter', (container, props) => new FunctionPlotterWidget(container, props));
        this.register('element', (container, props) => new PeriodicTableWidget(container, props));
        this.register('chemistry', (container, props) => new PeriodicTableWidget(container, props));
    }

    register(name, factoryFn) {
        this.factories.set(name.toLowerCase(), factoryFn);
    }

    has(name) {
        if (!name) return false;
        return this.factories.has(name.toLowerCase());
    }

    mount(name, containerEl, props = {}) {
        if (!name || !containerEl) return null;
        const factory = this.factories.get(name.toLowerCase());
        if (!factory) {
            console.warn(`[NexusWidgetRegistry] Unknown widget: ${name}`);
            return null;
        }
        return factory(containerEl, props);
    }

    mountAllInContainer(rootEl) {
        if (!rootEl) return;
        const placeholders = rootEl.querySelectorAll('[data-nexus-widget-placeholder]:not([data-mounted="true"])');
        placeholders.forEach(el => {
            const name = el.dataset.widgetName;
            let props = {};
            try {
                if (el.dataset.widgetProps) {
                    props = JSON.parse(decodeURIComponent(el.dataset.widgetProps));
                }
            } catch (e) {
                console.error('[NexusWidgetRegistry] Failed to parse props:', e);
            }

            if (this.has(name)) {
                el.dataset.mounted = 'true';
                this.mount(name, el, props);
            }
        });
    }
}

export const widgetRegistry = new NexusWidgetRegistry();
