from datetime import datetime


class DatastoreService:

    def __init__(self, catalyst_app):

        self.datastore = catalyst_app.datastore()
        self.zcql = catalyst_app.zcql()

        self.warning_table = self.datastore.table("earlywarnings")

    # --------------------------------------------------------
    # Forecast Results
    # --------------------------------------------------------

    def get_latest_forecast(self):

        query = """
        SELECT *
        FROM forecast_results
        ORDER BY CREATEDTIME DESC
        LIMIT 1
        """

        result = self.zcql.execute_query(query)
        print(result)

        if not result:
            return None

        return result[0]["forecast_results"]

    def get_historical_baseline(self, district_id):

        query = f"""
        SELECT AVG(predictedcrime) AS baseline
        FROM forecast_results
        WHERE districtid = {district_id}
        """

        result = self.zcql.execute_query(query)
        print("Baseline query result:", result)


        if not result:
            return 0

        baseline = result[0]["forecast_results"].get("AVG(predictedcrime)")

        if baseline is None:
            return 0

        return float(baseline)

    # --------------------------------------------------------
    # Early Warning
    # --------------------------------------------------------

    def insert_early_warning(

            self,

            district_id,

            predicted_count,

            historical_baseline,

            risk_level,

            recommendation,

            shap_factors="Generated using QuickML",

            crime_subhead_id=0

    ):

        row = {

            "districtid": district_id,

            "crimesubheadid": crime_subhead_id,

            "predictedcount": predicted_count,

            "historicalbaseline": historical_baseline,

            "risklevel": risk_level,

            "recommendation": recommendation,

            "generatedat": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

            "shaptopfactors": shap_factors

        }

        return self.warning_table.insert_row(row)