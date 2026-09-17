# Trust M signing device. The picowallet main.py is kept next to this as main_picowallet.py.
import sys
try:
    import agent
    agent.run()
except Exception as e:
    with open("error.log", "w") as f:
        sys.print_exception(e, f)
    sys.print_exception(e)
