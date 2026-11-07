import { planComparisonMatrix } from '@/data/marketing.ts';

export default function PlanComparisonTable() {
  return (
    <div className='overflow-x-auto rounded-xl border border-gray-200 shadow-2xs bg-white'>
      <table className='w-full text-left border-collapse min-w-[680px]'>
        <thead>
          <tr className='bg-gray-50 border-b border-gray-200'>
            <th className='py-4 px-5 text-sm font-bold text-gray-900 w-2/5'>
              Plan Feature
            </th>
            <th className='py-4 px-3 text-center text-sm font-bold text-gray-900'>
              Free Trial
            </th>
            <th className='py-4 px-3 text-center text-sm font-bold text-gray-900'>
              Starter
            </th>
            <th className='py-4 px-3 text-center text-sm font-bold text-primary-700 bg-primary-50/50'>
              Business
            </th>
            <th className='py-4 px-3 text-center text-sm font-bold text-gray-900'>
              Scale-Up
            </th>
          </tr>
        </thead>
        <tbody>
          {planComparisonMatrix.map((section) => (
            <tr key={section.category} className='contents'>
              <tr className='bg-gray-100/70 border-y border-gray-200'>
                <td
                  colSpan={5}
                  className='py-2.5 px-5 text-xs font-bold uppercase tracking-wider text-gray-700'
                >
                  {section.category}
                </td>
              </tr>
              {section.rows.map((row, rIdx) => (
                <tr
                  key={row.feature}
                  className={`border-b border-gray-100 hover:bg-gray-50/70 ${
                    rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                  }`}
                >
                  <td className='py-3 px-5 text-sm font-medium text-gray-800'>
                    {row.feature}
                  </td>
                  <td className='py-3 px-3 text-center text-xs sm:text-sm text-gray-600'>
                    {row.free}
                  </td>
                  <td className='py-3 px-3 text-center text-xs sm:text-sm text-gray-600'>
                    {row.starter}
                  </td>
                  <td className='py-3 px-3 text-center text-xs sm:text-sm font-semibold text-primary-700 bg-primary-50/30'>
                    {row.business}
                  </td>
                  <td className='py-3 px-3 text-center text-xs sm:text-sm text-gray-600'>
                    {row.scale}
                  </td>
                </tr>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
